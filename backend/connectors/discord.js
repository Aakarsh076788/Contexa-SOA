import { ContextaConnector } from './sdk.js';

export class DiscordConnector extends ContextaConnector {
  constructor() {
    super({
      id: 'discord',
      name: 'Discord',
      transport: 'bot',
      scopes: ['messages.read']
    });
  }

  normalizeEvent(rawEvent) {
    return {
      source: 'discord',
      type: 'message_sent',
      title: `#${rawEvent.channel} - ${rawEvent.author}`,
      detail: rawEvent.content,
      kind: 'CONVERSATION',
      entity: `#${rawEvent.channel}`,
      entityType: 'channel'
    };
  }
}
