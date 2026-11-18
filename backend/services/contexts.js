import { id } from '../utils/id.js';
import { safeHref } from './privacy.js';
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export const states = ['DISCOVERY', 'INVESTIGATION', 'IMPLEMENTATION', 'TESTING', 'REVIEW', 'COMPLETED', 'ARCHIVED'];

export async function deleteContexts(db, workspaceId, requested) {
  if (!Array.isArray(requested) || !requested.length || requested.length > 100 || requested.some(x => typeof x !== 'string')) throw fail('Choose between 1 and 100 contexts.');
  const ids = [...new Set(requested)];
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
    const owned = await tx.context.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true } });
    if (owned.length !== ids.length) throw fail('One or more contexts were not found in this workspace.', 404);
    const released = await tx.event.updateMany({ where: { workspaceId, contextId: { in: ids } }, data: { contextId: null } });
    await tx.entity.updateMany({ where: { workspaceId, contextId: { in: ids } }, data: { contextId: null } });
    await tx.context.deleteMany({ where: { workspaceId, id: { in: ids } } });
    return { deletedCount: owned.length, releasedSignals: released.count };
  });
}

export async function mergeContexts(db, workspaceId, requested) {
  const ids = Array.isArray(requested) ? [...new Set(requested)] : [];
  if (ids.length < 2 || ids.length > 100 || ids.some(x => typeof x !== 'string')) throw fail('Choose between 2 and 100 contexts.');
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
    const contexts = await tx.context.findMany({ where: { workspaceId, id: { in: ids } }, orderBy: { createdAt: 'asc' } });
    if (contexts.length !== ids.length) throw fail('One or more contexts were not found in this workspace.', 404);
    const primary = contexts[0], secondaryIds = contexts.slice(1).map(x => x.id);
    await tx.event.updateMany({ where: { workspaceId, contextId: { in: secondaryIds } }, data: { contextId: primary.id } });
    await tx.entity.updateMany({ where: { workspaceId, contextId: { in: secondaryIds } }, data: { contextId: primary.id } });
    await tx.relationship.updateMany({ where: { contextId: { in: secondaryIds }, context: { workspaceId } }, data: { contextId: primary.id } });
    // Preserve checkpoints and branches, renumbering them into the surviving context.
    const versions = await tx.version.findMany({ where: { contextId: { in: ids } }, orderBy: { createdAt: 'asc' } });
    const branches = await tx.branch.findMany({ where: { contextId: { in: secondaryIds } } });
    const numberMap = new Map();
    let number = Math.max(0, ...versions.filter(x => x.contextId === primary.id).map(x => x.number));
    for (const version of versions.filter(x => x.contextId !== primary.id)) {
      numberMap.set(`${version.contextId}:${version.number}`, ++number);
      await tx.version.update({ where: { id: version.id }, data: { contextId: primary.id, number } });
    }
    for (const branch of branches) await tx.branch.update({ where: { id: branch.id }, data: { contextId: primary.id, baseVersion: numberMap.get(`${branch.contextId}:${branch.baseVersion}`) || branch.baseVersion } });
    const notes = contexts.map(x => x.sessionNote).filter(Boolean).join('\n\n');
    const updated = await tx.context.update({ where: { id: primary.id }, data: { sources: [...new Set(contexts.flatMap(x => x.sources))], sessionNote: notes.slice(0, 2000), updatedAt: new Date() } });
    await tx.context.deleteMany({ where: { workspaceId, id: { in: secondaryIds } } });
    return { mergedInto: updated, deleted: secondaryIds };
  });
}

export async function importContext(db, workspaceId, pkg) {
  const item = pkg?.context;
  if (pkg?.schema !== 'contexa-context-package/v1' || !item || typeof item.name !== 'string' || !item.name.trim()) throw fail('Invalid context handoff package.');
  const array = key => {
    if (item[key] !== undefined && (!Array.isArray(item[key]) || item[key].length > 2000 || item[key].some(x => !x || typeof x !== 'object' || Array.isArray(x)))) throw fail(`Invalid ${key} in handoff package.`);
    return item[key] || [];
  };
  const entities = array('entities'), events = array('events'), relationships = array('relationships'), versions = array('versions'), branches = array('branches');
  const text = (value, limit, fallback = '') => typeof value === 'string' ? value.slice(0, limit) : fallback;
  const date = value => Number.isFinite(Date.parse(value)) ? new Date(value) : new Date();
  const source = value => ['chrome', 'vscode', 'discord', 'telegram', 'github'].includes(value) ? value : 'chrome';
  const mapIds = (items, type) => {
    const mapping = new Map();
    for (const x of items) {
      if (!x || typeof x.id !== 'string' || mapping.has(x.id)) throw fail(`Invalid or duplicate ${type} IDs.`);
      mapping.set(x.id, id(type));
    }
    return mapping;
  };
  const entityIds = mapIds(entities, 'entity'), eventIds = mapIds(events, 'event'), branchIds = mapIds(branches, 'branch');
  const versionNumbers = new Set();
  for (const version of versions) {
    if (!Number.isInteger(version.number) || version.number < 1 || versionNumbers.has(version.number)) throw fail('Invalid checkpoint numbers.');
    versionNumbers.add(version.number);
  }
  return db.$transaction(async tx => {
    const context = await tx.context.create({ data: {
      id: id('context'), workspaceId, name: `[Imported] ${item.name}`.slice(0, 80), topic: text(item.topic, 100, 'Imported work'),
      description: text(item.description, 500), tint: ['violet', 'blue', 'amber', 'rose'].includes(item.tint) ? item.tint : 'violet',
      state: states.includes(item.state) ? item.state : 'DISCOVERY', confidence: 0, embedding: [],
      sessionNote: text(item.sessionNote, 2000), nextAction: text(item.nextAction, 300, 'Review the imported context.'),
      sources: [...new Set(events.map(x => source(x.source)))]
    } });
    for (const entity of entities) await tx.entity.create({ data: { id: entityIds.get(entity.id), workspaceId, contextId: context.id, source: source(entity.source), type: text(entity.type, 80, 'activity'), label: text(entity.label, 500, 'Imported resource'), href: safeHref(entity.href), metadata: { imported: true, project: text(entity.metadata?.project, 200), topic: text(entity.metadata?.topic, 100), issue: text(entity.metadata?.issue, 100), file: text(entity.metadata?.file, 500), explanation: { method: 'imported', outcome: 'IMPORTED', score: 0, reasons: ['Imported from a handoff package. Review this assignment before relying on it.'], contextId: context.id } }, createdAt: date(entity.createdAt) } });
    for (const event of events) await tx.event.create({ data: { id: eventIds.get(event.id), workspaceId, contextId: context.id, source: source(event.source), type: text(event.type, 80, 'imported'), kind: text(event.kind, 40, 'ACTIVITY'), title: text(event.title, 500, 'Imported activity'), detail: text(event.detail, 4000), entityId: entityIds.get(event.entityId) || null, embedding: [], createdAt: date(event.createdAt) } });
    for (const branch of branches) await tx.branch.create({ data: { id: branchIds.get(branch.id), contextId: context.id, name: text(branch.name, 48, 'Imported branch'), baseVersion: versionNumbers.has(branch.baseVersion) ? branch.baseVersion : 0, status: branch.status === 'merged' ? 'merged' : 'active' } });
    for (const version of versions) await tx.version.create({ data: { id: id('version'), contextId: context.id, number: version.number, label: text(version.label, 100, 'Imported checkpoint'), summary: text(version.summary, 2000), state: states.includes(version.state) ? version.state : context.state, eventIds: (Array.isArray(version.eventIds) ? version.eventIds : []).map(x => eventIds.get(x)).filter(Boolean), entityIds: (Array.isArray(version.entityIds) ? version.entityIds : []).map(x => entityIds.get(x)).filter(Boolean), branchId: branchIds.get(version.branchId) || null, createdAt: date(version.createdAt) } });
    for (const edge of relationships) if (entityIds.has(edge.from || edge.fromEntity) && entityIds.has(edge.to || edge.toEntity)) await tx.relationship.create({ data: { id: id('relationship'), contextId: context.id, fromEntity: entityIds.get(edge.from || edge.fromEntity), toEntity: entityIds.get(edge.to || edge.toEntity), type: text(edge.type, 80, 'related_to'), reason: text(edge.reason, 1000, 'Imported link'), confidence: Math.max(0, Math.min(100, Math.trunc(Number(edge.confidence) || 0))) } });
    return context;
  }, { timeout: 30000 });
}
