import { db } from '../storage/db.js';
import { correlationEvidence } from './correlate.js';
export async function rebuildContextAssignments(workspaceId) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
    const contexts = await tx.context.findMany({ where: { workspaceId } });
    const events = await tx.event.findMany({ where: { workspaceId, type: { not: 'dismissed' } }, include: { entity: true } });
    let unassigned = 0;
    for (const event of events) {
      if (event.entity?.metadata?.explanation?.method === 'manual') continue;
      const activity = { source: event.source, title: event.title, detail: event.detail, project: event.entity?.metadata?.project || '' };
      const entities = event.entity?.metadata || {};
      const candidates = contexts.map(context => ({ context, evidence: correlationEvidence(context, activity, entities, event.embedding) })).sort((a, b) => b.evidence.score - a.evidence.score);
      const previous = candidates.find(x => x.context.id === event.contextId);
      const best = previous?.evidence.isHighConfidence ? previous : candidates[0];
      const contextId = best?.evidence.isHighConfidence ? best.context.id : null;
      if (contextId === event.contextId) continue;
      if (event.contextId && !contextId) unassigned++;
      await tx.event.update({ where: { id: event.id }, data: { contextId } });
      if (event.entity) {
        await tx.relationship.deleteMany({ where: { context: { workspaceId }, OR: [{ fromEntity: event.entityId }, { toEntity: event.entityId }] } });
        await tx.entity.update({ where: { id: event.entityId }, data: { contextId, metadata: { ...entities, explanation: { outcome: contextId ? 'MERGE' : 'SEPARATE', score: best?.evidence.score || 0, reasons: best?.evidence.evidence.map(x => x.description) || [], method: 'rebuild', contextId } } } });
      }
    }
    let activeContexts = 0;
    for (const context of contexts) {
      const records = await tx.event.findMany({ where: { workspaceId, contextId: context.id }, select: { source: true } });
      if (records.length) activeContexts++;
      await tx.context.update({ where: { id: context.id }, data: { sources: [...new Set(records.map(x => x.source))] } });
    }
    return { unassigned, activeContexts, unmatched: await tx.event.count({ where: { workspaceId, contextId: null, type: { not: 'dismissed' } } }) };
  }, { timeout: 30000 });
}
