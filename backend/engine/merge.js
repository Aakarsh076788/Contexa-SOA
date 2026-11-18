import { db } from '../storage/db.js';
import { id } from '../utils/id.js';
export async function mergeContextBranches(workspaceId, contextId, branchId) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
    const branch = await tx.branch.findFirst({ where: { id: branchId, contextId, context: { workspaceId } } });
    if (!branch) throw Object.assign(new Error('Branch not found.'), { status: 404 });
    if (branch.status !== 'active') throw Object.assign(new Error('This branch is already merged.'), { status: 409 });
    const context = await tx.context.findFirst({ where: { id: contextId, workspaceId } });
    const versions = await tx.version.findMany({ where: { contextId }, orderBy: { number: 'desc' } });
    const base = versions.find(x => x.number === branch.baseVersion);
    const branchVersion = versions.find(x => x.branchId === branchId) || base;
    const latest = versions.find(x => !x.branchId) || base;
    if (!base) throw Object.assign(new Error('Create a checkpoint before branching.'), { status: 400 });
    const version = await tx.version.create({ data: {
      id: id('version'), contextId, number: (versions[0]?.number || 0) + 1,
      label: `Merged branch: ${branch.name}`, summary: `Combined main and ${branch.name} checkpoints.`, state: context.state,
      eventIds: [...new Set([...(latest?.eventIds || []), ...(branchVersion?.eventIds || [])])],
      entityIds: [...new Set([...(latest?.entityIds || []), ...(branchVersion?.entityIds || [])])]
    } });
    await tx.branch.update({ where: { id: branch.id }, data: { status: 'merged' } });
    return version;
  });
}
