import { id } from '../utils/id.js';
import { states } from './contexts.js';
export async function createCheckpoint(db, workspaceId, contextId, data = {}) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
    const context = await tx.context.findFirst({ where: { id: contextId, workspaceId } });
    if (!context) throw Object.assign(new Error('Context not found.'), { status: 404 });
    if (data.state && !states.includes(data.state)) throw Object.assign(new Error('Invalid context state.'), { status: 400 });
    if (data.branchId && !await tx.branch.findFirst({ where: { id: data.branchId, contextId, status: 'active' } })) throw Object.assign(new Error('Choose an active branch in this context.'), { status: 400 });
    const latest = await tx.version.findFirst({ where: { contextId }, orderBy: { number: 'desc' } });
    const entities = await tx.entity.findMany({ where: { workspaceId, contextId }, select: { id: true } });
    const events = await tx.event.findMany({ where: { workspaceId, contextId }, select: { id: true } });
    return tx.version.create({ data: { id: id('version'), contextId, number: (latest?.number || 0) + 1, label: typeof data.label === 'string' ? data.label.slice(0, 100) : context.state, summary: typeof data.summary === 'string' ? data.summary.slice(0, 2000) : 'Context checkpoint created.', state: data.state || context.state, branchId: data.branchId || null, entityIds: entities.map(x => x.id), eventIds: events.map(x => x.id) } });
  });
}
export async function createBranch(db, workspaceId, contextId, data) {
  if (typeof data.name !== 'string' || !data.name.trim()) throw Object.assign(new Error('A branch name is required.'), { status: 400 });
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
    const context = await tx.context.findFirst({ where: { id: contextId, workspaceId } });
    if (!context) throw Object.assign(new Error('Context not found.'), { status: 404 });
    let base = await tx.version.findFirst({ where: { contextId }, orderBy: { number: 'desc' } });
    if (!base) base = await tx.version.create({ data: { id: id('version'), contextId, number: 1, label: 'Branch base', state: context.state, eventIds: (await tx.event.findMany({ where: { workspaceId, contextId }, select: { id: true } })).map(x => x.id), entityIds: (await tx.entity.findMany({ where: { workspaceId, contextId }, select: { id: true } })).map(x => x.id) } });
    return tx.branch.create({ data: { id: id('branch'), contextId, name: data.name.trim().slice(0, 48), baseVersion: base.number } });
  });
}
