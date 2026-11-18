import test, { before, after } from 'node:test';
import { startTestServer } from './support/server.js';
import assert from 'node:assert/strict';

let runtime, API_URL;
before(async () => { runtime = await startTestServer(); API_URL = `${runtime.url}/api`; }, { timeout: 60000 });
after(async () => { await runtime?.close(); });

test('Smoke Tests - Production Hardening', async (t) => {
  // 1. Health Check
  await t.test('GET /api/health should succeed', async () => {
    const res = await fetch(`${API_URL}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
  });

  // 2. Invalid Login (Auth route leak test)
  await t.test('POST /api/auth/login should fail securely without debug info', async () => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fake@example.com', password: 'wrongpassword' })
    });
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.error, 'Incorrect email or password.');
    assert.equal(data.debug, undefined, 'Debug info should not be leaked');
  });

  // 3. Invalid Connector Token
  await t.test('POST /api/connector-activity should fail securely with bad token', async () => {
    const res = await fetch(`${API_URL}/connector-activity`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Connector-Token': 'invalid-token'
      },
      body: JSON.stringify({ source: 'chrome', title: 'Test', url: 'http://example.com' })
    });
    assert.equal(res.status, 401);
  });

  // 4. Oversized Request Rejection (Testing body parser limit)
  await t.test('POST should reject oversized payloads (>1mb)', async () => {
    // Generate ~1.5mb payload
    const largeString = 'a'.repeat(1.5 * 1024 * 1024);
    const res = await fetch(`${API_URL}/connector-activity`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Connector-Token': 'invalid-token' // Auth doesn't matter, it should fail on body parsing first
      },
      body: JSON.stringify({ largeData: largeString })
    });
    assert.equal(res.status, 413); // Payload Too Large
  });
});
