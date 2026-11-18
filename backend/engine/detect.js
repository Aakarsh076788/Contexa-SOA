import { correlationEvidence } from './correlate.js';

export function detectCurrentContext(workspace, recentEvents) {
  // basic stub for now, return the most confident active context
  return workspace.contexts.filter(c => c.state !== 'COMPLETED' && c.state !== 'ARCHIVED').sort((a,b) => b.confidence - a.confidence)[0] || null;
}
