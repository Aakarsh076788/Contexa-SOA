import { sourceNames } from '../utils/format.js';
import { db } from '../storage/db.js';
import { presentEvent } from '../storage/workspace.js';

/**
 * Retrieves a context by ID from the database.
 * 
 * @param {string} workspaceId - The workspace to query
 * @param {string} contextId - The ID of the context to find
 * @returns {Promise<Object|null>} The context if found
 */
export const getContext = async (workspaceId, contextId) => {
  return db.context.findFirst({
    where: { id: contextId, workspaceId }
  });
};

/**
 * Retrieves events for a specific context ID, sorted by newest first.
 * 
 * @param {string} workspaceId - The workspace to query
 * @param {string} contextId - The context ID
 * @returns {Promise<Array>} List of events
 */
export const getEvents = async (workspaceId, contextId) => {
  const records = await db.event.findMany({
    where: { workspaceId, contextId },
    orderBy: { createdAt: 'desc' },
    include: { entity: true }
  });
  return records.map(presentEvent);
};

/**
 * Generates a summary for a context.
 * 
 * @param {string} workspaceId - The workspace
 * @param {Object} item - The context item
 * @returns {Promise<Object>} Context summary
 */
export async function summariseContext(workspaceId, item) { 
  const events = await getEvents(workspaceId, item.id); 
  const sourceList = [...new Set(events.map((entry) => sourceNames[entry.source]))]; 
  const implementation = events.filter((entry) => entry.source === 'vscode' || entry.kind === 'IMPLEMENTATION'); 
  const research = events.filter((entry) => entry.source === 'chrome' || entry.kind === 'RESEARCH'); 
  const discussion = events.filter((entry) => entry.source === 'discord' || entry.kind === 'CONVERSATION'); 
  const review = events.filter((entry) => entry.source === 'github'); 
  return { 
    headline: `${item.name} is currently in ${item.state.toLowerCase()}.`, 
    narrative: `${events.length} related signals from ${sourceList.join(', ') || 'no connected sources'} are saved in this context. ${research.length ? `${research.length} research signal${research.length === 1 ? '' : 's'} informed the work. ` : ''}${implementation.length ? `${implementation.length} implementation signal${implementation.length === 1 ? '' : 's'} record editor activity. ` : ''}${discussion.length ? `${discussion.length} discussion signal${discussion.length === 1 ? '' : 's'} add team context. ` : ''}${review.length ? `${review.length} GitHub signal${review.length === 1 ? '' : 's'} show issue or review progress.` : ''}`.trim(),
    completed: implementation.slice(0, 3).map((entry) => entry.title), 
    inProgress: item.state, 
    nextAction: item.nextAction,
    evidence: item.confidence >= 75 ? 'Strong multi-signal evidence' : 'Evidence is still developing' 
  }; 
}

/**
 * Gets full context detail including nested relationships.
 * 
 * @param {string} workspaceId - The workspace
 * @param {Object} item - The context item
 * @returns {Promise<Object>} Detailed context
 */
export async function contextDetail(workspaceId, item) { 
  const [events, entities, versions, branches, relationships, summary] = await Promise.all([
    getEvents(workspaceId, item.id),
    db.entity.findMany({ where: { contextId: item.id } }),
    db.version.findMany({ where: { contextId: item.id }, orderBy: { number: 'desc' } }),
    db.branch.findMany({ where: { contextId: item.id } }),
    db.relationship.findMany({ where: { contextId: item.id } }),
    summariseContext(workspaceId, item)
  ]);
  
  return { 
    ...item, 
    events, 
    entities, 
    relationships: relationships.map((item) => ({ ...item, from: item.fromEntity, to: item.toEntity })),
    versions, 
    branches, 
    summary 
  }; 
}

/**
 * Computes the difference between two context versions.
 * 
 * @param {string} workspaceId - The workspace
 * @param {string} contextId - The context ID
 * @param {number|string} fromNumber - Base version
 * @param {number|string} toNumber - Target version
 * @returns {Promise<Object|null>} Diff object
 */
export async function diff(workspaceId, contextId, fromNumber, toNumber) { 
  const records = await db.version.findMany({ where: { contextId } }); 
  const from = records.find((item) => item.number === Number(fromNumber)); 
  const to = records.find((item) => item.number === Number(toNumber)); 
  if (!from || !to) return null; 
  
  const entities = await db.entity.findMany({ where: { contextId } });
  const events = await db.event.findMany({ where: { contextId } });
  
  const label = (entityId) => entities.find((item) => item.id === entityId)?.label ?? entityId; 
  
  return { 
    from, 
    to, 
    added: to.entityIds.filter((item) => !from.entityIds.includes(item)).map(label), 
    removed: from.entityIds.filter((item) => !to.entityIds.includes(item)).map(label), 
    changed: to.eventIds.filter((item) => !from.eventIds.includes(item)).map((item) => events.find((event) => event.id === item)?.title ?? item), 
    stateChanged: from.state !== to.state ? `${from.state} → ${to.state}` : null 
  }; 
}
