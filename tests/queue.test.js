import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './support/server.js';
let enqueueActivity, processNextIngestion;
let runtime, workspaceId;
const settings = { tracking: true, apps: { chrome: true }, privacy: { cloudAI: false, captureMessages: true, excludedDomains: [], excludedProjects: [] } };
const offline = { embed: async () => [], judge: async () => ({ status: 'AI_UNAVAILABLE' }) };
const signal = id => ({ source: 'chrome', title: `Reliable queue signal ${id}`, href: 'https://sample.example.test/resource', externalId: id });
before(async () => {
  runtime = await startTestServer({ ingestionWorker: false });
  ({ enqueueActivity, processNextIngestion } = await import('../backend/services/ingestion-queue.js'));
  const user = await runtime.db.user.create({ data: { email: 'queue@example.test', password: 'unused' } });
  const workspace = await runtime.db.workspace.create({ data: { userId: user.id, settings } });
  workspaceId = workspace.id;
}, { timeout: 60000 });
after(async () => { await runtime?.close(); });

test('accepted deliveries persist before processing and replay does not duplicate events', async () => {
  const results = await Promise.all([1, 2, 3].map(() => enqueueActivity(runtime.db, workspaceId, signal('same-external-id'))));
  assert.equal(new Set(results.map(x => x.jobId)).size, 1);
  assert.equal(await runtime.db.event.count({ where: { workspaceId } }), 0);
  assert.equal(await processNextIngestion(runtime.db, offline), true);
  assert.equal(await runtime.db.event.count({ where: { workspaceId } }), 1);
  const job = await runtime.db.ingestionJob.findUnique({ where: { id: results[0].jobId } });
  assert.equal(job.status, 'completed'); assert.deepEqual(job.payload, {}); assert.ok(job.result.eventId);
  assert.equal((await runtime.db.event.findUnique({ where: { id: job.result.eventId } })).createdAt.getTime(), job.createdAt.getTime());
  const replay = await enqueueActivity(runtime.db, workspaceId, signal('same-external-id'));
  assert.equal(replay.jobId, job.id); assert.equal(replay.status, 'completed');
  assert.equal(await processNextIngestion(runtime.db, offline), false);
});
test('queued capture rechecks pause and exclusion policies before inference', async () => {
  const queued = await enqueueActivity(runtime.db, workspaceId, signal('paused-after-accept'));
  await runtime.db.workspace.update({ where: { id: workspaceId }, data: { settings: { ...settings, tracking: false } } });
  await processNextIngestion(runtime.db, { embed: async () => { throw Error('Inference should not run'); } });
  const job = await runtime.db.ingestionJob.findUnique({ where: { id: queued.jobId } });
  assert.equal(job.result.reason, 'tracking_paused'); assert.deepEqual(job.payload, {});
  assert.equal(await runtime.db.event.count({ where: { workspaceId } }), 1);
  await runtime.db.workspace.update({ where: { id: workspaceId }, data: { settings } });
});
test('transient failures retry with backoff and do not expose activity content in diagnostics', async () => {
  const queued = await enqueueActivity(runtime.db, workspaceId, signal('retry-on-outage'));
  await processNextIngestion(runtime.db, { embed: async () => { throw Error('sensitive activity details'); } });
  const job = await runtime.db.ingestionJob.findUnique({ where: { id: queued.jobId } });
  assert.equal(job.status, 'pending'); assert.equal(job.attempts, 1);
  assert.ok(job.availableAt > new Date()); assert.equal(job.lastError.includes('sensitive'), false);
  await runtime.db.ingestionJob.update({ where: { id: job.id }, data: { availableAt: new Date(0) } });
  await processNextIngestion(runtime.db, offline);
  assert.equal((await runtime.db.ingestionJob.findUnique({ where: { id: job.id } })).status, 'completed');
});
test('crashed worker leases are reclaimed and deleted queued data cannot be resurrected', async () => {
  const queued = await enqueueActivity(runtime.db, workspaceId, signal('lease-recovery'));
  await runtime.db.ingestionJob.update({ where: { id: queued.jobId }, data: { status: 'processing', lockedAt: new Date(Date.now() - 180000), leaseToken: 'dead-worker', attempts: 1 } });
  await processNextIngestion(runtime.db, offline);
  assert.equal((await runtime.db.ingestionJob.findUnique({ where: { id: queued.jobId } })).attempts, 2);
  const canceled = await enqueueActivity(runtime.db, workspaceId, signal('delete-during-inference'));
  const before = await runtime.db.event.count({ where: { workspaceId } });
  await processNextIngestion(runtime.db, { ...offline, embed: async () => {
    await runtime.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
      await tx.ingestionJob.deleteMany({ where: { id: canceled.jobId } });
    });
    return [];
  } });
  assert.equal(await runtime.db.event.count({ where: { workspaceId } }), before);
});
test('old queued payloads expire without becoming fresh captured events', async () => {
  const queued = await enqueueActivity(runtime.db, workspaceId, signal('expired-delivery'));
  await runtime.db.ingestionJob.update({ where: { id: queued.jobId }, data: { createdAt: new Date(Date.now() - 25 * 3600000) } });
  await processNextIngestion(runtime.db, offline);
  const job = await runtime.db.ingestionJob.findUnique({ where: { id: queued.jobId } });
  assert.equal(job.result.reason, 'expired_delivery'); assert.deepEqual(job.payload, {});
});
test('queue backpressure preserves acknowledgements for already accepted deliveries', async () => {
  await runtime.db.ingestionJob.createMany({ data: Array.from({ length: 1000 }, (_, i) => ({ id: `capacity-${i}`, workspaceId, fingerprint: `capacity-${i}`, payload: {} })) });
  await assert.rejects(enqueueActivity(runtime.db, workspaceId, signal('over-capacity')), { status: 429 });
  const replay = await enqueueActivity(runtime.db, workspaceId, signal('same-external-id'));
  assert.equal(replay.accepted, true); assert.equal(replay.status, 'completed');
  await runtime.db.ingestionJob.deleteMany({ where: { workspaceId, id: { startsWith: 'capacity-' } } });
});
