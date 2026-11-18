import test from 'node:test';
import assert from 'node:assert/strict';
import { createIngest } from '../backend/engine/ingest.js';

function fakeDatabase({ paused = false, contexts = [], failEvent = false } = {}) {
  const rows = { events: [], entities: [], contexts: structuredClone(contexts), edges: [] };
  const matches = (row, where) => (!where.id || typeof where.id === 'object' ? row.id !== where.id?.not : row.id === where.id) && (!Object.hasOwn(where, 'contextId') || row.contextId === where.contextId);
  const tx = {
    $executeRaw: async () => 0,
    workspace: { findUnique: async () => ({ id: 'ws', settings: { tracking: !paused, apps: { chrome: true }, privacy: { cloudAI: false } } }) },
    event: { findFirst: async ({ where }) => rows.events.find(row => { const entity = rows.entities.find(x => x.id === row.entityId); return where.entity ? entity?.metadata.fingerprint === where.entity.metadata.equals : matches(row, where); }) || null, findMany: async ({ where }) => rows.events.filter(x => matches(x, where)).map(x => ({ ...x, entity: rows.entities.find(e => e.id === x.entityId) })), create: async ({ data }) => { if (failEvent) throw new Error('write failed'); const row = { ...data, createdAt: new Date() }; rows.events.push(row); return row; }, update: async ({ where, data }) => Object.assign(rows.events.find(x => x.id === where.id), data) },
    entity: { findMany: async ({ where }) => rows.entities.filter(x => matches(x, where)), create: async ({ data }) => { rows.entities.push(data); return data; }, updateMany: async ({ where, data }) => { rows.entities.filter(x => matches(x, where)).forEach(x => Object.assign(x, data)); } },
    context: { findMany: async () => rows.contexts, findFirst: async ({ where }) => rows.contexts.find(x => x.id === where.id) || null, create: async ({ data }) => { rows.contexts.push(data); return data; }, update: async ({ where, data }) => Object.assign(rows.contexts.find(x => x.id === where.id), data) },
    relationship: { create: async ({ data }) => rows.edges.push(data) }, connector: { updateMany: async () => ({ count: 1 }) }
  };
  const database = { ...tx, $transaction: async callback => { const snapshot = structuredClone(rows); try { return await callback(tx); } catch (err) { Object.assign(rows, snapshot); throw err; } } };
  return { database, rows };
}
const activity = { source: 'chrome', title: 'JWT token expiration research', detail: 'Authentication documentation', href: 'https://docs.example.com/jwt' };

test('paused capture never calls AI or persists data', async () => {
  const { database, rows } = fakeDatabase({ paused: true });
  const ingest = createIngest({ database, embed: async () => { throw new Error('should not run'); }, judge: async () => { throw new Error('should not run'); } });
  assert.equal((await ingest('ws', activity)).reason, 'tracking_paused');
  assert.equal(rows.events.length, 0);
});
test('isolated signals are stored once and repeats are ignored', async () => {
  const { database, rows } = fakeDatabase();
  const ingest = createIngest({ database, embed: async () => [], judge: async () => ({ status: 'AI_UNAVAILABLE' }) });
  assert.equal((await ingest('ws', activity)).matched, 'SEPARATE');
  assert.equal((await ingest('ws', activity)).reason, 'duplicate');
  assert.equal(rows.events.length, 1);
  assert.equal(rows.entities.length, 1);
});
test('matching activity attaches with an explainable decision', async () => {
  const context = { id: 'ctx', name: 'JWT token expiration', topic: 'Authentication documentation', sources: [], embedding: [], updatedAt: new Date() };
  const { database, rows } = fakeDatabase({ contexts: [context] });
  const result = await createIngest({ database, embed: async () => [] })('ws', activity);
  assert.equal(result.context.id, 'ctx');
  assert.equal(result.matched, 'MERGE');
  assert.ok(rows.entities[0].metadata.explanation.reasons.length);
});
test('an event write failure rolls back its entity', async () => {
  const { database, rows } = fakeDatabase({ failEvent: true });
  await assert.rejects(createIngest({ database, embed: async () => [] })('ws', activity), /write failed/);
  assert.equal(rows.entities.length, 0);
});
