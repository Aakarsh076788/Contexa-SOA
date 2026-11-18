import { retentionDays } from './privacy.js';
const BATCH_SIZE = 500;

export async function applyRetention(db, workspaceId, settings, clock = new Date()) {
  const days = retentionDays[settings.retention ?? '90 days'];
  if (!days) return { deletedEvents: 0, deletedEntities: 0, hasMore: false };
  const cutoff = new Date(clock.getTime() - days * 86400000);
  const totals = { deletedEvents: 0, deletedEntities: 0, hasMore: false };
  // Each transaction has a bounded record set; remaining backlog is picked up on the next sweep.
  for (let batch = 0; batch < 20; batch++) {
    const result = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
      const events = await tx.event.findMany({ where: { workspaceId, createdAt: { lt: cutoff } }, select: { id: true }, take: BATCH_SIZE, orderBy: { id: 'asc' } });
      const eventIds = events.map(x => x.id);
      const deletedEvents = await tx.event.deleteMany({ where: { workspaceId, id: { in: eventIds } } });
      const entities = await tx.entity.findMany({ where: { workspaceId, createdAt: { lt: cutoff }, events: { none: {} } }, select: { id: true }, take: BATCH_SIZE, orderBy: { id: 'asc' } });
      const entityIds = entities.map(x => x.id);
      if (eventIds.length || entityIds.length) {
        const versions = await tx.version.findMany({ where: { context: { workspaceId }, OR: [{ eventIds: { hasSome: eventIds } }, { entityIds: { hasSome: entityIds } }] }, select: { id: true, eventIds: true, entityIds: true } });
        const eventSet = new Set(eventIds), entitySet = new Set(entityIds);
        for (const version of versions) await tx.version.update({ where: { id: version.id }, data: { eventIds: version.eventIds.filter(id => !eventSet.has(id)), entityIds: version.entityIds.filter(id => !entitySet.has(id)) } });
        await tx.relationship.deleteMany({ where: { context: { workspaceId }, OR: [{ fromEntity: { in: entityIds } }, { toEntity: { in: entityIds } }] } });
      }
      const deletedEntities = await tx.entity.deleteMany({ where: { workspaceId, id: { in: entityIds }, events: { none: {} } } });
      return { deletedEvents: deletedEvents.count, deletedEntities: deletedEntities.count, hasMore: events.length === BATCH_SIZE || entities.length === BATCH_SIZE };
    });
    totals.deletedEvents += result.deletedEvents; totals.deletedEntities += result.deletedEntities; totals.hasMore = result.hasMore;
    if (!result.hasMore) break;
  }
  return totals;
}
export function startRetention(db) {
  let running = false, stopped = false, active = null;
  const sweep = () => {
    if (running || stopped) return active;
    running = true;
    active = (async () => {
      let cursor;
      do {
        const workspaces = await db.workspace.findMany({ ...(cursor ? { where: { id: { gt: cursor } } } : {}), orderBy: { id: 'asc' }, take: 100, select: { id: true, settings: true } });
        for (const workspace of workspaces) { if (stopped) break; await applyRetention(db, workspace.id, workspace.settings || {}); }
        cursor = workspaces.length === 100 ? workspaces.at(-1).id : null;
      } while (cursor && !stopped);
      await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      await db.passwordRecovery.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    })().catch(() => console.error(JSON.stringify({ event: 'retention_failure', retry: 'next_sweep' }))).finally(() => { running = false; active = null; });
    return active;
  };
  const timer = setInterval(sweep, 3600000); timer.unref();
  return { sweep, stop: async () => { stopped = true; clearInterval(timer); await active; } };
}
