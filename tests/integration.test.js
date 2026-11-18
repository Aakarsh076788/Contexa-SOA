import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './support/server.js';
let runtime, alice, bob, aliceWorkspace, bobWorkspace;
async function api(path, { token = alice?.token, method = 'GET', body, expected = 200, connectorToken } = {}) {
  const response = await fetch(`${runtime.url}/api${path}`, { method, headers: { ...(token ? { 'X-Session-Token': token } : {}), ...(connectorToken ? { 'X-Connector-Token': connectorToken } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  return data;
}
before(async () => {
  runtime = await startTestServer();
  alice = await api('/auth/signup', { token: null, method: 'POST', body: { name: 'Alice', email: 'alice@example.test', password: 'disposable-password' }, expected: 201 });
  bob = await api('/auth/signup', { token: null, method: 'POST', body: { name: 'Bob', email: 'bob@example.test', password: 'disposable-password' }, expected: 201 });
  aliceWorkspace = await api('/workspace');
  bobWorkspace = await api('/workspace', { token: bob.token });
}, { timeout: 60000 });
after(async () => { await runtime?.close(); });

async function context(name, token = alice.token) { return api('/contexts', { token, method: 'POST', body: { name, topic: `${name} work` }, expected: 201 }); }
async function capture(title = 'JWT authentication research') {
  return api('/activity', { method: 'POST', body: { source: 'chrome', title, href: 'https://docs.example.test/jwt', detail: 'Token expiration documentation' }, expected: 201 });
}

test('health and auth protect API routes', async () => {
  assert.equal((await api('/health', { token: null })).ok, true);
  await api('/workspace', { token: null, expected: 401 });
  await api('/admin/stats', { expected: 403 });
});
test('pairing is source-bound, one-use, and workspace scoped', async () => {
  const code = await api('/connectors/pair/create', { method: 'POST', body: { source: 'chrome' }, expected: 201 });
  await api(`/connectors/pair/check/${code.code}`, { token: bob.token, expected: 404 });
  await api('/connectors/pair/verify', { token: null, method: 'POST', body: { code: code.code, source: 'telegram' }, expected: 400 });
  const verified = await api('/connectors/pair/verify', { token: null, method: 'POST', body: { code: code.code, source: 'chrome' } });
  assert.ok(verified.connectorToken);
  await api('/connectors/pair/verify', { token: null, method: 'POST', body: { code: code.code, source: 'chrome' }, expected: 400 });
  assert.equal((await api(`/connectors/pair/check/${code.code}`)).paired, true);
});
test('capture deduplicates concurrent events and records explanations', async () => {
  const body = { source: 'chrome', title: 'Concurrency isolated signal', href: 'https://example.test/concurrency' };
  const token = (await api('/connectors/access-token')).token;
  const results = await Promise.all(Array.from({ length: 4 }, () => fetch(`${runtime.url}/api/connector-activity`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Connector-Token': token }, body: JSON.stringify(body) }).then(x => x.json())));
  assert.equal(new Set(results.map(x => x.jobId)).size, 1);
  assert.equal(results.every(x => x.accepted), true);
  for (let i = 0; i < 100; i++) {
    if (await runtime.db.event.count({ where: { workspaceId: aliceWorkspace.id, title: body.title } })) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(await runtime.db.event.count({ where: { workspaceId: aliceWorkspace.id, title: body.title } }), 1);
  const { events } = await api('/events');
  assert.ok(events.find(x => x.title === body.title).explanation);
});
test('connector pause and exclusions are enforced across capture paths', async () => {
  await api('/connectors/chrome', { method: 'PUT', body: { connected: false } });
  const paused = await api('/activity', { method: 'POST', body: { source: 'chrome', title: 'Paused signal' } });
  assert.equal(paused.reason, 'connector_paused');
  await api('/connectors/chrome', { method: 'PUT', body: { connected: true } });
  await api('/settings', { method: 'PUT', body: { privacy: { excludedDomains: ['blocked.example'] } } });
  assert.equal((await api('/activity', { method: 'POST', body: { source: 'chrome', title: 'Excluded signal', href: 'https://sub.blocked.example/path' } })).reason, 'excluded_domain');
});
test('a pause during an in-flight capture prevents persistence', async () => {
  const { createIngest } = await import('../backend/engine/ingest.js');
  const before = await runtime.db.event.count({ where: { workspaceId: aliceWorkspace.id } });
  const ingest = createIngest({ database: runtime.db, embed: async () => {
    const workspace = await runtime.db.workspace.findUnique({ where: { id: aliceWorkspace.id } });
    await runtime.db.workspace.update({ where: { id: workspace.id }, data: { settings: { ...workspace.settings, tracking: false } } });
    return [];
  }, judge: async () => ({ status: 'AI_UNAVAILABLE' }) });
  const result = await ingest(aliceWorkspace.id, { source: 'chrome', title: 'In-flight capture example' });
  assert.equal(result.reason, 'tracking_paused');
  assert.equal(await runtime.db.event.count({ where: { workspaceId: aliceWorkspace.id } }), before);
  await api('/settings', { method: 'PUT', body: { tracking: true } });
});
test('cross-workspace delete fails before mutating any related records', async () => {
  const owned = await context('Alice owned');
  const foreign = await context('Bob owned', bob.token);
  const signal = await capture('Deletion isolation evidence');
  await api(`/events/${signal.event.id}`, { method: 'PATCH', body: { action: 'assign', contextId: foreign.id }, expected: 404 });
  await api('/contexts/batch-delete', { method: 'POST', body: { contextIds: [owned.id, foreign.id] }, expected: 404 });
  assert.ok(await runtime.db.context.findUnique({ where: { id: owned.id } }));
  assert.ok(await runtime.db.context.findUnique({ where: { id: foreign.id } }));
  await api(`/contexts/${foreign.id}`, { expected: 404 });
});
test('manual assignment, separation, dismiss, undo and rebuild preserve user decisions', async () => {
  const ctx = await context('Manual work');
  const signal = await capture('Manual assignment example');
  const result = await api(`/events/${signal.event.id}`, { method: 'PATCH', body: { action: 'assign', contextId: ctx.id } });
  assert.equal(result.event.contextId, ctx.id);
  await api('/context-engine/rebuild', { method: 'POST', body: {} });
  assert.equal((await runtime.db.event.findUnique({ where: { id: signal.event.id } })).contextId, ctx.id);
  await api(`/events/${signal.event.id}`, { method: 'PATCH', body: { action: 'undo', undoToken: 'stale' }, expected: 409 });
  const undone = await api(`/events/${signal.event.id}`, { method: 'PATCH', body: { action: 'undo', undoToken: result.undoToken } });
  assert.equal(undone.event.contextId, signal.event.contextId);
  const dismissed = await api(`/events/${signal.event.id}`, { method: 'PATCH', body: { action: 'dismiss' } });
  assert.equal(dismissed.event.type, 'dismissed');
  assert.equal((await api('/events?unassigned=true')).events.some(x => x.id === signal.event.id), false);
});
test('search is workspace scoped', async () => {
  const ctx = await context('UniqueAlphaSearch');
  await context('UniqueBetaSearch', bob.token);
  assert.equal((await api('/search?q=UniqueAlpha')).contexts[0].id, ctx.id);
  assert.equal((await api('/search?q=UniqueBeta')).contexts.length, 0);
});
test('settings responses redact secrets and reject credential injection', async () => {
  const workspace = await runtime.db.workspace.findUnique({ where: { id: aliceWorkspace.id } });
  await runtime.db.workspace.update({ where: { id: aliceWorkspace.id }, data: { settings: { ...workspace.settings, github: { token: 'fake-provider-secret', login: 'test' } } } });
  const settings = await api('/settings');
  assert.equal(JSON.stringify(settings).includes('fake-provider-secret'), false);
  assert.equal(JSON.stringify(await api('/workspace')).includes('fake-provider-secret'), false);
  await api('/settings', { method: 'PUT', body: { github: { token: 'injected' } } });
  const stored = await runtime.db.workspace.findUnique({ where: { id: aliceWorkspace.id } });
  assert.ok(stored.settings.github.token.startsWith('enc:v1:'));
  const { openSecret } = await import('../backend/services/secrets.js');
  assert.equal(openSecret(stored.settings.github.token), 'fake-provider-secret');
  const tampered = stored.settings.github.token.split(':');
  tampered[3] = Buffer.alloc(16).toString('base64url');
  assert.throws(() => openSecret(tampered.join(':')));
});
test('checkpoints are numbered safely, branches merge and full handoffs round-trip', async () => {
  const ctx = await context('Roundtrip work');
  const signal = await capture('Roundtrip activity example');
  await api(`/events/${signal.event.id}`, { method: 'PATCH', body: { action: 'assign', contextId: ctx.id } });
  const versions = await Promise.all([1, 2].map(n => api(`/contexts/${ctx.id}/versions`, { method: 'POST', body: { label: `Checkpoint ${n}` }, expected: 201 })));
  assert.notEqual(versions[0].number, versions[1].number);
  const branch = await api(`/contexts/${ctx.id}/branches`, { method: 'POST', body: { name: 'Experiment' }, expected: 201 });
  await api(`/contexts/${ctx.id}/versions`, { method: 'POST', body: { branchId: branch.id, label: 'Branch checkpoint' }, expected: 201 });
  await api(`/contexts/${ctx.id}/branches/${branch.id}/merge`, { method: 'POST', body: {}, expected: 201 });
  await api(`/contexts/${ctx.id}/branches/${branch.id}/merge`, { method: 'POST', body: {}, expected: 409 });
  const exported = await api(`/contexts/${ctx.id}/handoff`, { method: 'POST', body: {}, expected: 201 });
  const imported = await api('/contexts/import', { token: bob.token, method: 'POST', body: { package: exported.package }, expected: 201 });
  const detail = await api(`/contexts/${imported.id}`, { token: bob.token });
  assert.equal(detail.events.length, 1);
  assert.equal(detail.entities.length, 1);
  assert.equal(detail.versions.length, 4);
  assert.equal(detail.branches.length, 1);
  assert.notEqual(detail.events[0].id, signal.event.id);
  assert.ok(detail.versions.every(v => v.eventIds.includes(detail.events[0].id)));
  const plan = await api(`/contexts/${imported.id}/restore`, { token: bob.token, method: 'POST', body: { versionNumber: 4 } });
  assert.equal(plan.restorePlan.length, 1);
});
test('context merge preserves branch and checkpoint history', async () => {
  const first = await context('Merge primary'), second = await context('Merge secondary');
  await api(`/contexts/${second.id}/branches`, { method: 'POST', body: { name: 'Preserve me' }, expected: 201 });
  const merged = await api('/contexts/merge', { method: 'POST', body: { contextIds: [first.id, second.id] } });
  const detail = await api(`/contexts/${merged.mergedInto.id}`);
  assert.equal(detail.branches.length, 1);
  assert.equal(detail.versions.length, 1);
});
test('retention removes expired events, resources and checkpoint references atomically', async () => {
  const { applyRetention } = await import('../backend/services/retention.js');
  const ctx = await context('Retention example');
  const signal = await capture('Expired activity sample');
  await api(`/events/${signal.event.id}`, { method: 'PATCH', body: { action: 'assign', contextId: ctx.id } });
  const version = await api(`/contexts/${ctx.id}/versions`, { method: 'POST', body: {}, expected: 201 });
  const past = new Date(Date.now() - 120 * 86400000);
  await runtime.db.event.update({ where: { id: signal.event.id }, data: { createdAt: past } });
  await runtime.db.entity.update({ where: { id: signal.entity.id }, data: { createdAt: past } });
  const result = await applyRetention(runtime.db, aliceWorkspace.id, { retention: '90 days' });
  assert.equal(result.deletedEvents, 1);
  assert.equal(await runtime.db.entity.findUnique({ where: { id: signal.entity.id } }), null);
  assert.deepEqual((await runtime.db.version.findUnique({ where: { id: version.id } })).eventIds, []);
});
test('workspace summaries and filtered cursor pages stay bounded with stable ordering', async () => {
  const stamp = new Date('2026-01-01T10:00:00Z');
  await runtime.db.event.createMany({ data: Array.from({ length: 125 }, (_, i) => ({ id: `pagination-${String(i).padStart(3, '0')}`, workspaceId: aliceWorkspace.id, source: 'vscode', title: 'Pagination sample', kind: 'ACTIVITY', type: 'activity_recorded', embedding: [], createdAt: stamp })) });
  const summary = await api('/workspace');
  assert.equal(summary.events.length, 100);
  assert.ok(summary.eventPage.nextCursor);
  assert.ok(summary.counts.events >= 125);
  assert.equal(JSON.stringify(summary.contexts).includes('embedding'), false);
  const first = await api('/events?limit=50&q=Pagination');
  const second = await api(`/events?limit=50&q=Pagination&cursor=${first.nextCursor}`);
  const third = await api(`/events?limit=50&q=Pagination&cursor=${second.nextCursor}`);
  assert.equal(first.total, 125);
  const ids = [...first.events, ...second.events, ...third.events].map(x => x.id);
  assert.equal(ids.length, 125); assert.equal(new Set(ids).size, 125);
  assert.equal(third.nextCursor, null);
  await api('/events?limit=100000', { expected: 400 });
  await api('/events?cursor=invalid', { expected: 400 });
  await api('/events?from=not-a-date', { expected: 400 });
  assert.equal((await api('/events?eventId=pagination-001')).events[0].id, 'pagination-001');
  assert.equal((await api('/events?eventId=pagination-001', { token: bob.token })).events.length, 0);
});
test('server insights aggregate full history in the requested calendar time zone', async () => {
  const ctx = await context('Insight aggregation');
  const now = new Date();
  await runtime.db.event.createMany({ data: [0, 1, 2].map(i => ({ id: `insights-${i}`, workspaceId: aliceWorkspace.id, contextId: ctx.id, source: 'vscode', title: 'Insight sample', kind: 'ACTIVITY', type: i === 2 ? 'dismissed' : 'activity_recorded', embedding: [], createdAt: new Date(now.getTime() - 1000 + i) })) });
  const report = await api('/workspace/insights?timeZone=Asia%2FKolkata');
  assert.equal(report.days.length, 7);
  assert.equal(report.byContext.find(x => x.id === ctx.id).count, 2);
  assert.equal(report.days.reduce((sum, x) => sum + x.count, 0), report.total);
  await api('/workspace/insights?timeZone=invalid-zone', { expected: 400 });
  await api('/workspace/insights?period=all', { expected: 400 });
});
test('export omits credentials and deleting captured data leaves accounts intact', async () => {
  const exported = await api('/workspace/export');
  assert.equal(exported.schema, 'contexa-workspace-export/v1');
  assert.equal(JSON.stringify(exported).includes('fake-provider-secret'), false);
  await api('/workspace/activity', { method: 'DELETE' });
  assert.equal((await api('/workspace')).contexts.length, 0);
  assert.equal((await api('/events')).events.length, 0);
  assert.ok((await api('/workspace')).user.id);
  assert.ok((await api('/workspace', { token: bob.token })).contexts.length);
});
