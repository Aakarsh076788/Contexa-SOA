import { ContextaConnector } from './sdk.js';

export class VSCodeConnector extends ContextaConnector {
  constructor() {
    super({
      id: 'vscode',
      name: 'VS Code',
      transport: 'extension',
      scopes: ['workspace', 'files']
    });
  }

  normalizeEvent(rawEvent) {
    return rawEvent;
  }
}
