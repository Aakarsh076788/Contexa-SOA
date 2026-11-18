/**
 * Standard Interface for all Contexa Connectors.
 * Each connector (GitHub, Chrome, VSCode, Discord, etc.) should implement this class.
 */
export class ContextaConnector {
  /**
   * @param {Object} config
   * @param {string} config.id - e.g., 'discord', 'chrome'
   * @param {string} config.name - e.g., 'Discord', 'Chrome'
   * @param {string} config.transport - 'extension', 'oauth', 'webhook', 'bot', 'polling'
   * @param {string[]} config.scopes - data access scopes
   */
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.transport = config.transport;
    this.scopes = config.scopes || [];
  }

  // --- Lifecycle ---

  /**
   * Authenticate and establish connection with the service.
   * @param {Object} credentials 
   */
  async connect(credentials) {
    throw new Error('Not implemented');
  }

  /**
   * Clean up and close connection.
   */
  async disconnect() {
    throw new Error('Not implemented');
  }

  /**
   * Check if the connection is still alive.
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    return true;
  }

  // --- Data Collection ---

  /**
   * Pull new events since the given timestamp. (Useful for polling transports)
   * @param {string} since - ISO timestamp
   * @param {Object} workspace - The current workspace
   * @returns {Promise<Object[]>} Array of raw events
   */
  async collectEvents(since, workspace) {
    return [];
  }

  /**
   * Search for entities within the service.
   * @param {string} query 
   */
  async getEntities(query) {
    return [];
  }

  /**
   * Get detailed metadata for a specific entity.
   * @param {string} entityId 
   */
  async getMetadata(entityId) {
    return null;
  }

  // --- Normalization ---

  /**
   * Convert a raw app-specific event into a standard ContextEvent.
   * @param {Object} rawEvent 
   * @returns {Object} Standardized event payload
   */
  normalizeEvent(rawEvent) {
    throw new Error('Not implemented');
  }
}
