import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeConfig, createReadinessCheck } from '../backend/services/runtime.js';

test('production refuses missing persistent encryption key and invalid public origins', () => {
  const base = { DATABASE_URL: 'postgresql://local/db', NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://app.example.test', CONTEXA_SECRET_KEY: 'ab'.repeat(32) };
  assert.equal(runtimeConfig(base).proxyHops, 0);
  assert.throws(() => runtimeConfig({ ...base, CONTEXA_SECRET_KEY: '' }), /stable/);
  assert.throws(() => runtimeConfig({ ...base, PUBLIC_ORIGIN: 'http://app.example.test' }), /HTTPS/);
  assert.throws(() => runtimeConfig({ ...base, PUBLIC_ORIGIN: 'https://app.example.test/path' }), /exact/);
  assert.throws(() => runtimeConfig({ ...base, TRUST_PROXY_HOPS: 'true' }), /TRUST_PROXY/);
});

test('readiness checks schema, coalesces probes, and redacts failure details', async () => {
  let checks = 0;
  const good = { user: { findFirst: async () => { checks++; return null; } }, $queryRaw: async () => [] };
  const ready = createReadinessCheck(good);
  const results = await Promise.all([ready(), ready(), ready()]);
  assert.equal(checks, 1);
  assert.equal(results.every(x => x.ok), true);
  const bad = createReadinessCheck({ ...good, $queryRaw: async () => { throw new Error('secret connection details'); } });
  const failure = await bad();
  assert.equal(failure.ok, false);
  assert.equal(JSON.stringify(failure).includes('secret'), false);
});

test('readiness times out without blocking a health probe indefinitely', async () => {
  const ready = createReadinessCheck({ user: { findFirst: () => new Promise(() => {}) }, $queryRaw: async () => [] }, { timeoutMs: 15 });
  assert.equal((await ready()).ok, false);
});
