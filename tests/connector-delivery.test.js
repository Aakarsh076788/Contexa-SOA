import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDeliveryQueue } from '../connectors/shared/delivery-queue.js';
test('bot queue survives restart, encrypts payloads, backs off and expires metadata', async () => {
  process.env.CONTEXA_SECRET_KEY = 'ab'.repeat(32);
  const directory = await mkdtemp(path.join(tmpdir(), 'contexa-queue-'));
  try {
    const file = path.join(directory, 'queue');
    let clock = 100000, calls = 0;
    const queue = createDeliveryQueue(file, async () => { calls++; throw new Error('offline'); }, { now: () => clock });
    await queue.add({ externalId: 'stable', title: 'private activity title' }, 'private-token');
    const saved = await readFile(file, 'utf8');
    assert.match(saved, /^enc:v1:/); assert.equal(saved.includes('private'), false);
    await queue.flush(); assert.equal(calls, 1);
    clock += 3000;
    const delivered = [];
    const restarted = createDeliveryQueue(file, async payload => { delivered.push(payload); return { ok: true }; }, { now: () => clock });
    await restarted.flush(); assert.deepEqual(delivered.map(x => x.externalId), ['stable']);
    await restarted.flush(); assert.equal(delivered.length, 1);
    await queue.add({ externalId: 'expired' }, 'private-token');
    clock += 86400001;
    const expired = createDeliveryQueue(file, async () => { throw new Error('expired activity must not deliver'); }, { now: () => clock });
    await expired.flush();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
