import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { db } from './db.js';
import { ensureWorkspace, settingsFor } from './workspace.js';

const dataPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'contexa.json');

export async function migrateLegacyWorkspace() {
  let legacy;
  try { legacy = JSON.parse(await readFile(dataPath, 'utf8')); } catch { return { migrated: 0 }; }
  if (!Array.isArray(legacy.users) || legacy.users.length === 0) return { migrated: 0 };
  let migrated = 0;
  for (const legacyUser of legacy.users) {
    if (await db.user.findUnique({ where: { email: legacyUser.email } })) continue;
    const user = await db.user.create({ data: { id: legacyUser.id, name: legacyUser.name || 'Contexa user', email: legacyUser.email, password: legacyUser.passwordHash || legacyUser.password, connectorToken: legacyUser.connectorToken || randomBytes(32).toString('hex') } });
    const { workspace } = await ensureWorkspace(user);
    const legacyWorkspace = legacy.workspaces?.[legacyUser.id];
    if (!legacyWorkspace) { migrated += 1; continue; }
    await db.workspace.update({ where: { id: workspace.id }, data: { settings: settingsFor(legacyWorkspace.settings) } });
    const contexts = legacyWorkspace.contexts ?? [];
    for (const context of contexts) {
      await db.context.create({ data: { id: context.id, workspaceId: workspace.id, name: context.name, topic: context.topic ?? context.name, description: context.description ?? '', state: context.state ?? 'DISCOVERY', confidence: context.confidence ?? 50, tint: context.tint ?? 'violet', sources: context.sources ?? [], sessionNote: context.sessionNote ?? '', nextAction: context.nextAction ?? 'Review the related work and choose the next action.', createdAt: new Date(context.createdAt ?? Date.now()), updatedAt: new Date(context.updatedAt ?? context.createdAt ?? Date.now()) } });
    }
    const contextIds = new Set(contexts.map((context) => context.id));
    const entities = legacyWorkspace.entities ?? [];
    for (const entity of entities) await db.entity.create({ data: { id: entity.id, workspaceId: workspace.id, contextId: contextIds.has(entity.contextId) ? entity.contextId : null, source: entity.source, type: entity.type, label: entity.label, href: entity.href ?? '', metadata: entity.metadata ?? {}, createdAt: new Date(entity.createdAt ?? Date.now()) } });
    const entityIds = new Set(entities.map((entity) => entity.id));
    for (const event of legacyWorkspace.events ?? []) await db.event.create({ data: { id: event.id, workspaceId: workspace.id, contextId: contextIds.has(event.contextId) ? event.contextId : null, source: event.source, type: event.type, kind: event.kind, title: event.title, detail: event.detail ?? '', entityId: entityIds.has(event.entityId) ? event.entityId : null, createdAt: new Date(event.createdAt ?? Date.now()) } });
    for (const relationship of legacyWorkspace.relationships ?? []) if (contextIds.has(relationship.contextId) && entityIds.has(relationship.from) && entityIds.has(relationship.to)) await db.relationship.create({ data: { id: relationship.id, contextId: relationship.contextId, fromEntity: relationship.from, toEntity: relationship.to, type: relationship.type ?? 'related_to', reason: relationship.reason ?? 'Imported relationship.', confidence: relationship.confidence ?? 60, createdAt: new Date(relationship.createdAt ?? Date.now()) } });
    for (const version of legacyWorkspace.versions ?? []) if (contextIds.has(version.contextId)) await db.version.create({ data: { id: version.id, contextId: version.contextId, number: version.number, label: version.label, summary: version.summary ?? '', state: version.state, entityIds: version.entityIds ?? [], eventIds: version.eventIds ?? [], createdAt: new Date(version.createdAt ?? Date.now()) } });
    for (const branch of legacyWorkspace.branches ?? []) if (contextIds.has(branch.contextId)) await db.branch.create({ data: { id: branch.id, contextId: branch.contextId, name: branch.name, baseVersion: branch.baseVersion ?? 0, status: branch.status ?? 'active', createdAt: new Date(branch.createdAt ?? Date.now()) } });
    migrated += 1;
  }
  return { migrated };
}
