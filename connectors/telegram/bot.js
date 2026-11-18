import { createDeliveryQueue } from '../shared/delivery-queue.js';
/**
 * Contexa Official Telegram Connector Bot.
 * Listens to group discussions and direct messages on Telegram,
 * and streams them in real-time into Contexa's Context Intelligence Engine.
 */

import { telegramCanManage } from '../shared/permissions.js';
import dotenv from 'dotenv';
import { sealSecret, openSecret } from '../../backend/services/secrets.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load root .env
dotenv.config({ path: join(__dirname, '../../.env') });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_URL = process.env.CONTEXA_API_URL || 'http://127.0.0.1:4000';
const deliveryQueue = createDeliveryQueue(join(__dirname, 'delivery.queue'), (payload, token) => fetch(`${API_URL}/api/connector-activity`, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', 'X-Connector-Token': token }, body: JSON.stringify(payload) }));
setInterval(() => deliveryQueue.flush(), 15000).unref();


const CHATS_FILE = join(__dirname, 'chats.json');
let chatTokens = {};
try {
  if (existsSync(CHATS_FILE)) {
    chatTokens = JSON.parse(readFileSync(CHATS_FILE, 'utf8'));
  }
} catch {
  chatTokens = {};
}

function saveChatToken(chatId, token) {
  chatTokens[chatId] = { token: sealSecret(token), approved: true };
  try {
    writeFileSync(CHATS_FILE, JSON.stringify(chatTokens, null, 2));
  } catch (err) {
    console.error('Failed to save chats.json:', err);
  }
}

if (!BOT_TOKEN) {
  console.log('====================================================');
  console.log('🤖 Contexa Telegram Bot Standby Mode');
  console.log('ℹ️  TELEGRAM_BOT_TOKEN is not set in .env');
  console.log('ℹ️  To connect real Telegram: Create a bot with @BotFather and add:');
  console.log('   TELEGRAM_BOT_TOKEN="your_bot_token_here" to your .env');
  console.log('📡 Signal Simulator is ready for live testing via Contexa UI.');
  console.log('====================================================');
} else {
  console.log('====================================================');
  console.log('🤖 Contexa Telegram Bot is online and polling!');
  console.log(`📡 Streaming activity to: ${API_URL}/api/connector-activity`);
  console.log('🌐 Listening to linked Telegram chats and groups.');
  console.log('====================================================');

  let offset = 0;

  async function telegramRequest(method, body = {}) {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.json();
  }

  async function pollUpdates() {
    try {
      const data = await telegramRequest('getUpdates', { offset, timeout: 25 });
      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          await handleUpdate(update);
        }
      }
    } catch (err) {
      // Ignore network timeout
    } finally {
      setTimeout(pollUpdates, 1000);
    }
  }

  async function handleUpdate(update) {
    const message = update.message || update.channel_post;
    if (!message || !message.text) return;

    const text = message.text.trim();
    const chatId = String(message.chat.id);
    const chatTitle = message.chat.title || message.chat.username || 'Direct Message';
    const authorName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || message.from?.username || 'User';

    const isLinkCommand = /^[!\/]?(?:link|unlink)(?:@[^\s]+)?(?:\s|$)/i.test(text) || /^[A-Za-z0-9]{6}$/.test(text) || /^\/start\s+[A-Za-z0-9]{6}$/i.test(text);
    if (isLinkCommand) {
      let memberStatus;
      if (message.chat.type !== 'private' && message.from?.id && !message.sender_chat) {
        const membership = await telegramRequest('getChatMember', { chat_id: chatId, user_id: message.from.id });
        memberStatus = membership.ok ? membership.result?.status : null;
      }
      if (!telegramCanManage(message.chat.type, memberStatus, message.from?.id)) {
        await telegramRequest('sendMessage', { chat_id: chatId, text: 'Only a chat administrator can link or disconnect this group.' });
        return;
      }
    }

    // 1. Handle plain /start or /help
    if (text === '/start' || text.startsWith('/help') || text.startsWith('!help')) {
      await telegramRequest('sendMessage', {
        chat_id: chatId,
        parse_mode: 'HTML',
        text: `👋 <b>Welcome to Contexa!</b>\n\nTo link this Telegram chat or group to your Contexa workspace:\n1. Open <b>Contexa</b> ➔ <b>Connectors</b> ➔ <b>Telegram</b> to view your 6-character PIN.\n2. In this chat, send:\n<code>/link [YOUR-CODE]</code>\n\n<i>Example: <code>/link 9PMTJ8</code></i>\n\nTo disconnect anytime, simply send <code>/unlink</code>.`
      });
      return;
    }

    // 2. Handle /unlink command
    if (text === '/unlink' || text === '!unlink') {
      if (chatTokens[chatId]) {
        if (chatTokens[chatId]?.token) deliveryQueue.removeToken(openSecret(chatTokens[chatId].token));
      delete chatTokens[chatId];
        try {
          writeFileSync(CHATS_FILE, JSON.stringify(chatTokens, null, 2));
        } catch (err) {
          console.error('Failed to update chats.json on unlink:', err);
        }
        console.log(`[Telegram Unlink] Chat ${chatId} (${chatTitle}) unlinked.`);
        await telegramRequest('sendMessage', {
          chat_id: chatId,
          parse_mode: 'HTML',
          text: `🔌 <b>Contexa Unlinked!</b>\n\nThis chat (<b>${chatTitle}</b>) has been disconnected from your workspace. No further messages from this chat will be captured or streamed.`
        });
      } else {
        await telegramRequest('sendMessage', {
          chat_id: chatId,
          text: `ℹ️ This chat is not currently connected to any Contexa workspace.`
        });
      }
      return;
    }

    // 2. Check for /start <CODE> or /link <CODE> or !link <CODE> or plain 6-character code
    const linkMatch = text.match(/^[!\/]?(?:start|link)(?:@[^\s]+)?\s+([A-Za-z0-9]{6})/i) || text.match(/^([A-Za-z0-9]{6})$/i);
    if (linkMatch) {
      const code = linkMatch[1].toUpperCase();
      console.log(`[Telegram Link] Received a pairing request from @${authorName} in ${chatTitle}`);
      try {
        const res = await fetch(`${API_URL}/api/connectors/pair/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, source: 'telegram' })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          saveChatToken(chatId, data.connectorToken);
          console.log(`[Telegram Link] Saved token for chat ${chatId} (${chatTitle})`);
          await telegramRequest('sendMessage', {
            chat_id: chatId,
            parse_mode: 'HTML',
            text: `🎉 <b>Contexa Linked!</b>\n\nThis Telegram chat (<b>${chatTitle}</b>) is now connected to your workspace. Messages sent here will stream in real-time to your Context Graph.`
          });
          return;
        } else {
          await telegramRequest('sendMessage', {
            chat_id: chatId,
            text: `❌ Link Failed: ${data.error || 'Invalid or expired code.'}`
          });
          return;
        }
      } catch (err) {
        console.error('Error verifying Telegram pairing:', err);
        return;
      }
    }

    if (text.length < 3) return;

    const approval = chatTokens[chatId];
    const connectorToken = approval?.approved ? openSecret(approval.token) : null;
    if (!connectorToken) {
      console.log(`[Telegram Ingest Skipped] Chat "${chatTitle}" (${chatId}) is not linked yet. Type /link [CODE] to link.`);
      return;
    }

    const cleanTitle = text.split('\n')[0].slice(0, 100).trim();
    const activityPayload = {
      source: 'telegram',
      externalId: `${chatId}:${message.message_id}`,
      type: 'message_sent',
      kind: 'CONVERSATION',
      title: cleanTitle,
      detail: `#${chatTitle} · @${authorName}${text.length > cleanTitle.length ? ` · ${text.slice(cleanTitle.length).trim()}` : ''}`,
      entity: `#${chatTitle}`,
      entityType: 'chat',
      href: '',
      project: ''
    };

    try { await deliveryQueue.add(activityPayload, connectorToken); } catch { console.error('Capture could not be queued. Configure CONTEXA_SECRET_KEY and writable queue storage.'); }
  }

  pollUpdates();
}
