import { ContextaConnector } from './sdk.js';

export class TelegramConnector extends ContextaConnector {
  constructor() {
    super({
      id: 'telegram',
      name: 'Telegram',
      transport: 'bot',
      scopes: ['group chats', 'direct messages']
    });
  }

  normalizeEvent(rawEvent) {
    return {
      source: 'telegram',
      type: 'message_sent',
      title: rawEvent.title || rawEvent.content?.slice(0, 80) || 'Telegram Message',
      detail: rawEvent.detail || rawEvent.chat || 'Telegram Chat',
      kind: 'CONVERSATION',
      entity: rawEvent.entity || rawEvent.chat || 'Telegram',
      entityType: 'chat'
    };
  }
}
