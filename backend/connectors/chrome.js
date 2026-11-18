import { ContextaConnector } from './sdk.js';

export class ChromeConnector extends ContextaConnector {
  constructor() {
    super({
      id: 'chrome',
      name: 'Chrome',
      transport: 'extension',
      scopes: ['history', 'tabs']
    });
  }

  normalizeEvent(rawEvent) {
    return rawEvent;
  }
}
