export class ConnectorRegistry {
  constructor() {
    this.connectors = new Map();
  }

  register(connector) {
    this.connectors.set(connector.id, connector);
    console.log(`[ConnectorRegistry] Registered connector: ${connector.name} (${connector.id})`);
  }

  get(id) {
    return this.connectors.get(id);
  }

  list() {
    return Array.from(this.connectors.values());
  }

  unregister(id) {
    this.connectors.delete(id);
  }
}

export const registry = new ConnectorRegistry();
