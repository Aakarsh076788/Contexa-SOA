import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { startTestServer } from './support/server.js';
import { recoveryAvailable, requestRecovery, resetPassword } from '../backend/services/recovery.js';
import { verifyPassword } from '../backend/utils/crypto.js';

let runtime, user;
const env = { PUBLIC_ORIGIN: 'https://contexa.example.test', RESEND_API_KEY: 'synthetic-only', RECOVERY_FROM_EMAIL: 'account@example.test' };
before(async () => {
  runtime = await startTestServer({ ingestionWorker: false });
  assert.equal((await fetch(`${runtime.url}/api/ready`)).status, 200, 'real migrated database must be ready');
  user = await runtime.db.user.create({ data: { id: 'recovery-test-user', name: 'Recovery test', email: 'recovery@example.test', password: 'invalid-old-hash' } });
});
after(async () => runtime?.close());

test('recovery is explicitly unavailable until email and HTTPS origin are configured', () => {
  assert.equal(recoveryAvailable({}), false);
  assert.equal(recoveryAvailable({ ...env, PUBLIC_ORIGIN: 'http://localhost:5173' }), false);
  assert.equal(recoveryAvailable(env), true);
});

test('recovery stores only a hash, resets once, and invalidates all sessions', async () => {
  let sent;
  await requestRecovery(runtime.db, user.email, { env, send: async value => { sent = value; } });
  assert.equal(sent.email, user.email);
  const token = new URLSearchParams(new URL(sent.link).hash.slice(1)).get('token');
  const record = await runtime.db.passwordRecovery.findFirst({ where: { userId: user.id } });
  assert.notEqual(record.tokenHash, token);
  assert.equal(record.tokenHash, createHash('sha256').update(token).digest('hex'));
  await runtime.db.session.create({ data: { id: 'synthetic-session', userId: user.id, expiresAt: new Date(Date.now() + 60000) } });
  await resetPassword(runtime.db, token, 'changed-test-password');
  assert.equal(await verifyPassword('changed-test-password', (await runtime.db.user.findUnique({ where: { id: user.id } })).password), true);
  assert.equal(await runtime.db.session.count({ where: { userId: user.id } }), 0);
  await assert.rejects(resetPassword(runtime.db, token, 'second-password'), { status: 400 });
});

test('unknown accounts and disabled recovery never send email; expired token fails', async () => {
  let sends = 0;
  await requestRecovery(runtime.db, 'unknown@example.test', { env, send: async () => { sends++; } });
  await requestRecovery(runtime.db, user.email, { env: {}, send: async () => { sends++; } });
  assert.equal(sends, 0);
  const token = 'aa'.repeat(32);
  await runtime.db.passwordRecovery.create({ data: { id: 'expired-recovery', userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(0) } });
  await assert.rejects(resetPassword(runtime.db, token, 'changed-test-password'), { status: 400 });
});

test('parallel use of the same reset link succeeds once', async () => {
  await runtime.db.passwordRecovery.deleteMany({ where: { userId: user.id } });
  let sent;
  await requestRecovery(runtime.db, user.email, { env, send: async value => { sent = value; } });
  const token = new URLSearchParams(new URL(sent.link).hash.slice(1)).get('token');
  const results = await Promise.allSettled([resetPassword(runtime.db, token, 'parallel-password-one'), resetPassword(runtime.db, token, 'parallel-password-two')]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
});
