import { randomUUID } from 'node:crypto';
import { db } from '../storage/db.js';
import { safeErrorDetails } from '../utils/diagnostics.js';
import { activityFingerprint, createIngest } from '../engine/ingest.js';
import { collectionDecision, normalizeActivity } from './privacy.js';
const MAX_ATTEMPTS = 5;
const MAX_AGE_MS = 24 * 3600000;

// The queue stores only the same privacy-approved fields as captured activity, never credentials.
export async function enqueueActivity(database, workspaceId, input) {
  return database.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
    const workspace = await tx.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) throw Object.assign(new Error('Workspace not found.'), { status: 404 });
    const activity = normalizeActivity(input, workspace.settings || {});
    const policy = collectionDecision(workspace.settings || {}, activity);
    if (!policy.allowed) return { ignored: true, reason: policy.reason };
    // Stable external IDs dedupe permanently within the job lifetime. Legacy clients dedupe a minute.
    const fingerprint = `${activityFingerprint(workspaceId, activity)}${activity.externalId ? '' : `:${Math.floor(Date.now() / 60000)}`}`;
    const existing = await tx.ingestionJob.findUnique({ where: { workspaceId_fingerprint: { workspaceId, fingerprint } }, select: { id: true, status: true } });
    if (existing) return { accepted: true, jobId: existing.id, status: existing.status };
    const backlog = await tx.ingestionJob.count({ where: { workspaceId, status: { in: ['pending', 'processing'] } } });
    if (backlog >= 1000) throw Object.assign(new Error('Capture is catching up. Keep this activity queued and retry shortly.'), { status: 429 });
    const job = await tx.ingestionJob.upsert({ where: { workspaceId_fingerprint: { workspaceId, fingerprint } }, create: { id: randomUUID(), workspaceId, fingerprint, payload: activity }, update: {}, select: { id: true, status: true } });
    return { accepted: true, jobId: job.id, status: job.status };
  });
}

export async function processNextIngestion(database = db, dependencies = {}) {
  const leaseToken = randomUUID();
  const [job] = await database.$queryRaw`
    UPDATE "IngestionJob" SET status = 'processing', "lockedAt" = CURRENT_TIMESTAMP, "leaseToken" = ${leaseToken}, attempts = attempts + 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = (SELECT id FROM "IngestionJob" WHERE attempts < ${MAX_ATTEMPTS}
      AND ((status = 'pending' AND "availableAt" <= CURRENT_TIMESTAMP) OR (status = 'processing' AND "lockedAt" < CURRENT_TIMESTAMP - interval '2 minutes'))
      ORDER BY "availableAt", "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING *`;
  if (!job) return false;
  try {
    let result;
    if (Date.now() - new Date(job.createdAt).getTime() > MAX_AGE_MS) result = { ignored: true, reason: 'expired_delivery' };
    else {
      const ingest = createIngest({ database, ...dependencies, capturedAt: job.createdAt, beforePersist: async tx => Boolean(await tx.ingestionJob.findFirst({ where: { id: job.id, status: 'processing', leaseToken }, select: { id: true } })) });
      result = await ingest(job.workspaceId, job.payload);
      if (result.reason === 'privacy_changed_retry') throw new Error('Policy changed during processing.');
    }
    await database.ingestionJob.updateMany({ where: { id: job.id, leaseToken }, data: { status: 'completed', payload: {}, result: { ignored: Boolean(result.ignored), reason: result.reason || null, eventId: result.event?.id || null }, lastError: null, lockedAt: null, leaseToken: null } });
  } catch (error) {
    const retry = job.attempts < MAX_ATTEMPTS && !(error.status >= 400 && error.status < 500);
    await database.ingestionJob.updateMany({ where: { id: job.id, leaseToken }, data: { status: retry ? 'pending' : 'failed', ...(retry ? {} : { payload: {} }), lastError: 'Activity processing failed. Retry capture or check server diagnostics.', availableAt: new Date(Date.now() + Math.min(60000, 1000 * 2 ** job.attempts)), lockedAt: null, leaseToken: null } });
    console.error(JSON.stringify({ event: 'ingestion_failure', jobId: job.id, retry, attempts: job.attempts, error: safeErrorDetails(error) }));
  }
  return true;
}

export function startIngestionWorker(database = db) {
  let stopped = false, active = null;
  let lastWorkerError = '', lastWorkerErrorAt = 0;
  const tick = () => {
    if (stopped || active) return;
    active = (async () => {
      // Bound each wake-up; durable records survive shutdown and process crashes.
      for (let i = 0; i < 10 && !stopped; i++) if (!await processNextIngestion(database)) break;
      await database.ingestionJob.deleteMany({ where: { status: { in: ['completed', 'failed'] }, updatedAt: { lt: new Date(Date.now() - 7 * 86400000) } } });
      // Exhausted crashed leases must not remain processing forever.
      await database.ingestionJob.updateMany({ where: { status: 'processing', attempts: { gte: MAX_ATTEMPTS }, lockedAt: { lt: new Date(Date.now() - 120000) } }, data: { status: 'failed', payload: {}, leaseToken: null, lockedAt: null, lastError: 'Processing exhausted its retry limit.' } });
    })().catch(error => {
      const details = safeErrorDetails(error);
      const signature = `${details.name}:${details.code || ''}:${details.message}`;
      const now = Date.now();
      if (signature !== lastWorkerError || now - lastWorkerErrorAt >= 30000) {
        console.error(JSON.stringify({ event: 'ingestion_worker_unavailable', error: details }));
        lastWorkerError = signature;
        lastWorkerErrorAt = now;
      }
    }).finally(() => { active = null; });
  };
  const timer = setInterval(tick, 1000); timer.unref(); tick();
  return { stop: async () => { stopped = true; clearInterval(timer); await active; } };
}
