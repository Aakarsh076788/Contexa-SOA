import { id } from '../utils/id.js';
import { states } from './contexts.js';
export async function reviewEvent(db, workspaceId, eventId, input) {
  if (!input || (input.contextId && typeof input.contextId !== 'string') || (input.createName && typeof input.createName !== 'string')) throw Object.assign(new Error('Invalid activity assignment.'), { status: 400 });
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
    const event = await tx.event.findFirst({ where: { id: eventId, workspaceId }, include: { entity: true } });
    if (!event) throw Object.assign(new Error('Activity not found.'), { status: 404 });
    const metadata = event.entity?.metadata || {};
    const history = Array.isArray(metadata.reviewHistory) ? metadata.reviewHistory : [];
    let contextId = input.contextId || null, type = event.type;
    if (input.action === 'undo') {
      const last = history.at(-1);
      if (!last || input.undoToken !== last.id) throw Object.assign(new Error('This activity has changed. Refresh before undoing.'), { status: 409 });
      contextId = last.contextId; type = last.type; history.pop();
    } else {
      if (!['assign', 'dismiss'].includes(input.action)) throw Object.assign(new Error('Choose assign, dismiss, or undo.'), { status: 400 });
      history.push({ id: id('review'), contextId: event.contextId, type: event.type, at: new Date().toISOString() });
      if (history.length > 10) history.shift();
      if (input.action === 'dismiss') { contextId = null; type = 'dismissed'; }
      else if (input.createName?.trim()) {
        const context = await tx.context.create({ data: { id: id('context'), workspaceId, name: input.createName.trim().slice(0, 80), topic: event.title.slice(0, 100), description: 'Created from a reviewed activity.', state: 'DISCOVERY', confidence: 0, sources: [event.source], embedding: [] } });
        contextId = context.id;
      } else if (event.type === 'dismissed') type = 'activity_recorded';
    }
    if (contextId && !await tx.context.findFirst({ where: { id: contextId, workspaceId } })) throw Object.assign(new Error('Context not found in this workspace.'), { status: 404 });
    const explanation = { outcome: contextId ? 'MANUAL' : 'SEPARATE', score: 0, reasons: [input.action === 'undo' ? 'Previous assignment restored by you.' : input.action === 'dismiss' ? 'Dismissed from the activity inbox by you.' : contextId ? 'Assigned to this context by you.' : 'Separated from its context by you.'], contextId, method: 'manual' };
    let entityId = event.entityId;
    if (event.entity) {
      const other = await tx.event.count({ where: { workspaceId, entityId, id: { not: eventId } } });
      if (other) {
        const { id: oldId, events, ...copy } = event.entity;
        const entity = await tx.entity.create({ data: { ...copy, id: id('entity'), contextId, metadata: { ...metadata, explanation, reviewHistory: history } } });
        entityId = entity.id;
      } else {
        await tx.relationship.deleteMany({ where: { context: { workspaceId }, OR: [{ fromEntity: entityId }, { toEntity: entityId }] } });
        await tx.entity.update({ where: { id: entityId }, data: { contextId, metadata: { ...metadata, explanation, reviewHistory: history } } });
      }
    }
    if (!event.entity) {
      const entity = await tx.entity.create({ data: { id: id('entity'), workspaceId, contextId, source: event.source, type: 'activity', label: event.title, metadata: { explanation, reviewHistory: history } } });
      entityId = entity.id;
    }
    const updated = await tx.event.update({ where: { id: eventId }, data: { contextId, type, entityId } });
    for (const cid of [...new Set([event.contextId, contextId].filter(Boolean))]) {
      const records = await tx.event.findMany({ where: { workspaceId, contextId: cid }, select: { source: true } });
      await tx.context.updateMany({ where: { id: cid, workspaceId }, data: { sources: [...new Set(records.map(x => x.source))], updatedAt: new Date() } });
    }
    return { event: updated, explanation, undoToken: input.action === 'undo' ? null : history.at(-1)?.id };
  });
}
