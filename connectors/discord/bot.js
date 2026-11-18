import { createDeliveryQueue } from '../shared/delivery-queue.js';
/**
 * Contexa Official Discord Connector Bot.
 * Listens to team discussions and code reviews in designated Discord channels,
 * and streams them in real-time into Contexa's Context Intelligence Engine.
 */

import { discordCanManage } from '../shared/permissions.js';
import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import { sealSecret, openSecret } from '../../backend/services/secrets.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load root .env
dotenv.config({ path: join(__dirname, '../../.env') });

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const API_URL = process.env.CONTEXA_API_URL || 'http://127.0.0.1:4000';
const deliveryQueue = createDeliveryQueue(join(__dirname, 'delivery.queue'), (payload, token) => fetch(`${API_URL}/api/connector-activity`, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', 'X-Connector-Token': token }, body: JSON.stringify(payload) }));
setInterval(() => deliveryQueue.flush(), 15000).unref();

const TRACKED_CHANNELS = process.env.DISCORD_TRACKED_CHANNELS 
  ? process.env.DISCORD_TRACKED_CHANNELS.split(',').map(c => c.trim().toLowerCase().replace(/^#/, ''))
  : [];

if (!BOT_TOKEN) {
  console.error('[Contexa Discord] Error: DISCORD_BOT_TOKEN is not defined in .env');
  console.error('[Contexa Discord] Please add DISCORD_BOT_TOKEN="your_token_here" to your .env file.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('clientReady', (readyClient) => {
  console.log('====================================================');
  console.log(`🤖 Contexa Discord Bot is online as @${readyClient.user.tag}!`);
  console.log(`📡 Streaming activity to: ${API_URL}/api/connector-activity`);
  if (TRACKED_CHANNELS.length > 0) {
    console.log(`🎯 Filtering channels: #${TRACKED_CHANNELS.join(', #')}`);
  } else {
    console.log(`🔒 Capturing only channels explicitly linked by a server administrator.`);
  }
  console.log('====================================================');
});

import { readFileSync, writeFileSync, existsSync } from 'fs';

const SERVERS_FILE = join(__dirname, 'servers.json');
let serverTokens = {};

try {
  if (existsSync(SERVERS_FILE)) {
    serverTokens = JSON.parse(readFileSync(SERVERS_FILE, 'utf8'));
  }
} catch {
  serverTokens = {};
}

function saveServerToken(mappingId, token, channelId) {
  serverTokens[mappingId] = { token: sealSecret(token), channelId };
  try {
    writeFileSync(SERVERS_FILE, JSON.stringify(serverTokens, null, 2));
  } catch (err) {
    console.error('Failed to save servers.json:', err);
  }
}

client.on('messageCreate', async (message) => {
  // 1. Ignore bot messages to prevent feedback loops
  if (message.author.bot) return;

  const content = message.content?.trim();
  if (!content) return;

  const channelName = message.channel.name || 'general';
  const authorName = message.member?.displayName || message.author.globalName || message.author.username;
  const serverName = message.guild?.name || 'Discord';
  const guildId = message.guildId || 'default';
  const mappingId = `${guildId}:${message.channel.id}`;

  // 2. Check for !link or /link pairing command: e.g. "!link H7X9K2" or "/link H7X9K2"
  const linkMatch = content.match(/^[!\/]link\s+([A-Za-z0-9]{6})/i);
  if (linkMatch) {
    if (!discordCanManage(message)) { await message.reply('Only a server member with Manage Server permission can link this channel.'); return; }
    const code = linkMatch[1].toUpperCase();
    console.log(`[Discord Link] Received a pairing request from @${authorName} in #${channelName}`);
    try {
      const res = await fetch(`${API_URL}/api/connectors/pair/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, source: 'discord' })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        saveServerToken(mappingId, data.connectorToken, message.channel.id);
        console.log(`[Discord Link] Saved token for guild ${guildId} (${serverName})`);
        await message.reply(`🎉 **Contexa Linked!** This channel in **${serverName}** is now connected to your workspace. Messages in this channel will stream to your Context Graph.`);
        return;
      } else {
        await message.reply(`❌ **Link Failed:** ${data.error || 'Invalid or expired code.'}`);
        return;
      }
    } catch (err) {
      await message.reply(`❌ **Server Error:** Could not reach Contexa API at ${API_URL}`);
      return;
    }
  }

  // 3. Check for !unlink or /unlink command
  if (content === '!unlink' || content === '/unlink') {
    if (!discordCanManage(message)) { await message.reply('Only a server member with Manage Server permission can disconnect this channel.'); return; }
    if (serverTokens[mappingId]) {
      if (serverTokens[mappingId]?.token) deliveryQueue.removeToken(openSecret(serverTokens[mappingId].token));
      delete serverTokens[mappingId];
      try {
        writeFileSync(SERVERS_FILE, JSON.stringify(serverTokens, null, 2));
      } catch (err) {
        console.error('Failed to update servers.json on unlink:', err);
      }
      console.log(`[Discord Unlink] Server ${guildId} (${serverName}) unlinked.`);
      await message.reply(`🔌 **Contexa Unlinked!** This Discord server (**${serverName}**) channel has been disconnected from your workspace.`);
    } else {
      await message.reply(`ℹ️ This Discord server is not currently connected to any Contexa workspace.`);
    }
    return;
  }

  // 4. Ignore too short messages
  if (content.length < 3) return;

  // 4. Optional channel filter
  if (TRACKED_CHANNELS.length > 0 && !TRACKED_CHANNELS.includes(channelName.toLowerCase())) {
    return;
  }

  const approval = serverTokens[mappingId];
  const connectorToken = approval?.channelId === message.channel.id ? openSecret(approval.token) : null;
  if (!connectorToken) {
    console.log(`[Discord Ingest Skipped] Server "${serverName}" (${guildId}) is not linked yet. Type !link [CODE] to link.`);
    return;
  }

  console.log('[Discord Ingest] Processing activity from a linked channel.');

  // 5. Construct normalized Contexa activity payload with semantic title
  const cleanTitle = content.split('\n')[0].slice(0, 100).trim();
  const activityPayload = {
    source: 'discord',
    externalId: message.id,
    type: 'message_sent',
    kind: 'CONVERSATION',
    title: cleanTitle,
    detail: `#${channelName} · @${authorName}${content.length > cleanTitle.length ? ` · ${content.slice(cleanTitle.length).trim()}` : ''}`,
    entity: `#${channelName}`,
    entityType: 'channel',
    href: message.url || '',
    project: ''
  };

  try { await deliveryQueue.add(activityPayload, connectorToken); } catch { console.error('Capture could not be queued. Configure CONTEXA_SECRET_KEY and writable queue storage.'); }
});

// Login to Discord
client.login(BOT_TOKEN).catch((err) => {
  console.error('[Contexa Discord] Failed to log in to Discord:', err.message);
});
