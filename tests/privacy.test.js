import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionDecision, normalizeActivity, publicSettings, settingsUpdate, safeHref } from '../backend/services/privacy.js';
import { keywordSimilarity } from '../backend/engine/local.js';
import { normalizeJudgment, matchDecision } from '../backend/services/matching.js';
import { activityInsights } from '../src/lib/insights.js';
import { hashPassword, verifyPassword } from '../backend/utils/crypto.js';
import { verifyGoogleCredential } from '../backend/services/google-auth.js';

test('privacy controls enforce pause, individual apps, domains and projects', () => {
  const settings = { tracking: true, apps: { chrome: true }, privacy: { excludedDomains: ['private.example'], excludedProjects: ['secret'] } };
  assert.equal(collectionDecision(settings, { source: 'chrome', href: 'https://sub.private.example/page' }).reason, 'excluded_domain');
  assert.equal(collectionDecision(settings, { source: 'chrome', project: 'Secret' }).reason, 'excluded_project');
  assert.equal(collectionDecision(settings, { source: 'vscode' }).reason, 'connector_paused');
  assert.equal(collectionDecision({ ...settings, tracking: false }, { source: 'chrome' }).reason, 'tracking_paused');
  assert.equal(collectionDecision(settings, { source: 'chrome', href: 'https://private.example.attacker.test' }).allowed, true);
});
test('public settings and updates never expose or overwrite stored credentials', () => {
  const original = { github: { token: 'secret', login: 'demo' }, privacy: { cloudAI: false }, apps: { chrome: true } };
  const updated = settingsUpdate(original, { github: { token: 'attacker' }, diagnostics: { x: 'bad' }, privacy: { cloudAI: true, excludedDomains: [' Example.com ', 'Example.com'] } });
  assert.equal(updated.github.token, 'secret');
  assert.equal(JSON.stringify(publicSettings(updated)).includes('secret'), false);
  assert.deepEqual(updated.privacy.excludedDomains, ['example.com']);
  assert.throws(() => settingsUpdate(original, { retention: 'never_valid' }));
});
test('message content is redacted and unsafe resource URLs are rejected', () => {
  const activity = normalizeActivity({ source: 'discord', title: 'private message', detail: 'secret details', entity: '#team', entityType: 'channel' }, { privacy: { captureMessages: false } });
  assert.equal(activity.title, 'Activity in #team');
  assert.equal(JSON.stringify(activity).includes('secret details'), false);
  assert.equal(safeHref('javascript:alert(1)'), '');
  assert.equal(safeHref('https://user:password@example.com'), '');
  assert.throws(() => normalizeActivity({ source: 'chrome', title: {} }, {}));
});
test('AI confidence is normalized and explicit rejection cannot merge', () => {
  assert.equal(normalizeJudgment({ related: true, confidence: 85 }).confidence, 0.85);
  assert.equal(normalizeJudgment({ related: true, confidence: 0.85 }).confidence, 0.85);
  assert.equal(matchDecision({ score: 34 }, { related: false, confidence: 0.99, status: 'AI_REJECTED' }), 'SEPARATE');
  assert.equal(matchDecision({ score: 34 }, { status: 'AI_UNAVAILABLE' }), 'MERGE');
  assert.equal(matchDecision({ score: 12 }, { status: 'AI_UNAVAILABLE' }), 'UNCERTAIN');
});
test('insights use real date windows and transitions without invented time', () => {
  const events = [
    { createdAt: '2026-10-19T10:00:00', contextId: 'a', source: 'chrome' },
    { createdAt: '2026-10-19T11:00:00', contextId: 'a', source: 'vscode' },
    { createdAt: '2026-10-20T10:00:00', contextId: 'b', source: 'chrome' },
    { createdAt: '2026-10-12T10:00:00', contextId: 'old', source: 'chrome' }
  ];
  const now = new Date('2026-10-20T12:00:00');
  assert.equal(activityInsights(events, 'This week', now).total, 3);
  assert.equal(activityInsights(events, 'This week', now).switches, 1);
  assert.equal(activityInsights(events, 'Last week', now).total, 1);
});
test('password verification handles invalid hashes and wrong passwords', async () => {
  const hash = await hashPassword('correct-password');
  assert.equal(await verifyPassword('correct-password', hash), true);
  assert.equal(await verifyPassword('wrong-password', hash), false);
  assert.equal(await verifyPassword('anything', 'bad-hash'), false);
});
test('Google credentials go through the verifier with audience and verified email', async () => {
  const original = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  try {
    let received;
    const fake = { verifyIdToken: async args => { received = args; return { getPayload: () => ({ sub: 'identity', email: 'demo@example.com', email_verified: true }) }; } };
    assert.equal((await verifyGoogleCredential('signed-token', fake)).sub, 'identity');
    assert.deepEqual(received, { idToken: 'signed-token', audience: 'test-client' });
    await assert.rejects(verifyGoogleCredential('forged', { verifyIdToken: async () => { throw new Error('Bad signature'); } }), { status: 401 });
    await assert.rejects(verifyGoogleCredential('unverified', { verifyIdToken: async () => ({ getPayload: () => ({ sub: 'id', email: 'demo@example.com', email_verified: false }) }) }), { status: 401 });
  } finally { if (original === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = original; }
});

test('short unrelated word prefixes do not manufacture topic overlap', () => {
  assert.equal(keywordSimilarity(['car'], ['cat']), 0);
  assert.equal(keywordSimilarity(['auth'], ['author']), 0);
  assert.ok(keywordSimilarity(['authentication'], ['authentication']) <= 1);
});

test('message privacy never falls back to using message content as a channel label', () => {
  const activity = normalizeActivity({ source: 'telegram', title: 'private message body', detail: 'private details' }, { privacy: { captureMessages: false } });
  assert.equal(JSON.stringify(activity).includes('private'), false);
  assert.equal(activity.entity, 'Telegram chat');
});
