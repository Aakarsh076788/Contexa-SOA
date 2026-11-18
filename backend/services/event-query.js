import { presentEvent } from '../storage/workspace.js';
const invalid = message => Object.assign(new Error(message), { status: 400 });
export function encodeCursor(event) { return Buffer.from(JSON.stringify([new Date(event.createdAt).toISOString(), event.id])).toString('base64url'); }
export function eventQuery(workspaceId, query = {}) {
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalid('Activity limit must be between 1 and 100.');
  const where = { workspaceId, kind: { not: 'DIAGNOSTIC' } };
  if (query.inbox === 'true' || query.unassigned === 'true') where.contextId = null;
  if (query.dismissed === 'true') where.type = 'dismissed';
  else if (query.includeDismissed !== 'true') where.type = { not: 'dismissed' };
  if (query.source) where.source = String(query.source).slice(0, 40);
  if (query.eventId) where.id = String(query.eventId).slice(0, 150);
  if (query.q) { const contains = { contains: String(query.q).trim().slice(0, 200), mode: 'insensitive' }; where.OR = [{ title: contains }, { detail: contains }]; }
  const range = {};
  for (const [key, operator] of [['from', 'gte'], ['to', 'lt']]) if (query[key]) {
    const value = new Date(query[key]);
    if (!Number.isFinite(value.getTime())) throw invalid('Choose a valid activity date range.');
    range[operator] = value;
  }
  if (range.gte && range.lt && range.gte >= range.lt) throw invalid('The start date must precede the end date.');
  if (Object.keys(range).length) where.createdAt = range;
  let after;
  if (query.cursor) {
    try {
      const [date, id] = JSON.parse(Buffer.from(String(query.cursor), 'base64url').toString());
      if (typeof id !== 'string' || !id || !Number.isFinite(new Date(date).getTime())) throw Error();
      after = { OR: [{ createdAt: { lt: new Date(date) } }, { createdAt: new Date(date), id: { lt: id } }] };
    } catch { throw invalid('This activity cursor is invalid. Refresh the list.'); }
  }
  return { where, pageWhere: after ? { AND: [where, after] } : where, limit };
}
export async function listEvents(database, workspaceId, query) {
  const { where, pageWhere, limit } = eventQuery(workspaceId, query);
  const [records, total] = await Promise.all([
    database.event.findMany({ where: pageWhere, include: { entity: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 }),
    database.event.count({ where })
  ]);
  const events = records.slice(0, limit);
  return { events: events.map(presentEvent), total, nextCursor: records.length > limit ? encodeCursor(events.at(-1)) : null };
}
