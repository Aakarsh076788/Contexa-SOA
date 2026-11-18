import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { withWorkspaceLock } from '../backend/services/workspace-lock.js';
import { startTestServer } from './support/server.js';
import { createHash } from 'node:crypto';
const tokenHash = value => createHash('sha256').update(value).digest('hex');
import { discordCanManage, telegramCanManage } from '../connectors/shared/permissions.js';
let runtime, token, cookie;
before(async () => {
  runtime = await startTestServer();
  const response = await fetch(`${runtime.url}/api/auth/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Security Test', email: 'security@example.test', password: 'disposable-password' }) });
  cookie = response.headers.get('set-cookie');
  token = (await response.json()).token;
});
after(async () => runtime?.close());
const request = (path, method = 'GET', body, headers = {}) => fetch(`${runtime.url}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Session-Token': token, ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
test('browser sessions use HttpOnly cookies and only hashes are stored', async () => {
  assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i);
  assert.equal(await runtime.db.session.findUnique({ where: { id: token } }), null);
  assert.ok(await runtime.db.session.findUnique({ where: { id: `sha256:${tokenHash(token)}` } }));
  const response = await request('/auth/session', 'GET', null, { Cookie: cookie.split(';')[0], 'X-Session-Token': '' });
  assert.equal(response.status, 200);
  const list = await (await request('/account/sessions')).json();
  assert.equal(JSON.stringify(list).includes(token), false);
  assert.equal(list.sessions.some(item => 'id' in item), false);
  assert.equal((await request('/auth/session', 'GET', null, { 'X-Session-Token': `sha256:${tokenHash(token)}` })).status, 401);
});
test('session and recovery status GETs do not consume sign-in attempts', async () => {
  for (let i = 0; i < 12; i++) {
    assert.equal((await request('/auth/recovery/status')).status, 200);
    assert.equal((await request('/auth/session')).status, 200);
  }
  const login = await request('/auth/login', 'POST', { email: 'security@example.test', password: 'disposable-password' });
  assert.equal(login.status, 200);
  assert.ok((await login.json()).token);
});
test('cross-site cookie mutations and login are rejected', async () => {
  assert.equal((await request('/account/profile', 'PUT', { name: 'Blocked' }, { Cookie: cookie.split(';')[0], Origin: 'https://evil.example' })).status, 403);
  assert.equal((await request('/auth/login', 'POST', { email: 'security@example.test', password: 'disposable-password' }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
});
test('pairing claim is atomic, credentials source scoped and revocable', async () => {
  const code = await (await request('/connectors/pair/create', 'POST', { source: 'chrome' })).json();
  const claims = await Promise.all([1, 2].map(() => request('/connectors/pair/verify', 'POST', { code: code.code, source: 'chrome' })));
  assert.deepEqual(claims.map(x => x.status).sort(), [200, 400]);
  const device = await claims.find(x => x.status === 200).json();
  const stored = await runtime.db.deviceCredential.findUnique({ where: { id: device.deviceId } });
  assert.equal(stored.tokenHash, tokenHash(device.connectorToken));
  const extension = await request('/connector-activity', 'POST', { source: 'chrome', type: 'page_opened', kind: 'BROWSER', title: 'Extension delivery', href: 'https://example.test/research', externalId: 'security-extension-event' }, { 'X-Connector-Token': device.connectorToken, Origin: 'chrome-extension://test-extension', 'Sec-Fetch-Site': 'cross-site' });
  assert.ok([200, 201, 202].includes(extension.status), `extension rejected: ${extension.status}`);
  const mismatch = await request('/connector-activity', 'POST', { source: 'vscode', title: 'Wrong source' }, { 'X-Connector-Token': device.connectorToken });
  assert.equal(mismatch.status, 403);
  assert.equal((await request(`/connectors/devices/${device.deviceId}`, 'DELETE')).status, 200);
  assert.equal((await request('/connector-activity', 'POST', { source: 'chrome', title: 'Revoked' }, { 'X-Connector-Token': device.connectorToken })).status, 401);
});
test('connector toggles and pairing preserve concurrent privacy changes', async () => {
  const user = await runtime.db.user.findUnique({ where: { email: 'security@example.test' }, include: { workspace: true } });
  const pair = await (await request('/connectors/pair/create', 'POST', { source: 'vscode' })).json();
  let toggle, verify;
  await withWorkspaceLock(runtime.db, user.workspace.id, async tx => {
    const workspace = await tx.workspace.findUnique({ where: { id: user.workspace.id } });
    toggle = request('/connectors/chrome', 'PUT', { connected: false });
    verify = request('/connectors/pair/verify', 'POST', { code: pair.code, source: 'vscode' });
    // Hold the privacy lock while the requests enter their settings mutation path.
    await new Promise(resolve => setTimeout(resolve, 75));
    await tx.workspace.update({ where: { id: workspace.id }, data: { settings: { ...workspace.settings, tracking: false, privacy: { ...workspace.settings.privacy, captureMessages: false, excludedDomains: ['private.example.test'] } } } });
  });
  assert.equal((await toggle).status, 200); assert.equal((await verify).status, 200);
  const settings = await (await request('/settings')).json();
  assert.equal(settings.tracking, false);
  assert.equal(settings.apps.chrome, false);
  assert.equal(settings.apps.vscode, true);
  assert.equal(settings.privacy.captureMessages, false);
  assert.deepEqual(settings.privacy.excludedDomains, ['private.example.test']);
});
test('legacy credential revocation persists after workspace bootstrap', async () => {
  const old = await (await request('/connectors/access-token')).json();
  assert.ok(old.token);
  assert.equal((await request('/connectors/legacy-credential', 'DELETE')).status, 200);
  const devices = await (await request('/connectors/devices')).json();
  assert.equal(devices.legacyCredentialActive, false);
  assert.equal((await request('/connector-activity', 'POST', { source: 'chrome', title: 'Old device' }, { 'X-Connector-Token': old.token })).status, 401);
});
test('password change revokes other sessions', async () => {
  const second = await (await request('/auth/login', 'POST', { email: 'security@example.test', password: 'disposable-password' })).json();
  assert.equal((await request('/account/password', 'POST', { currentPassword: 'disposable-password', newPassword: 'changed-disposable-password' })).status, 200);
  assert.equal((await request('/auth/session', 'GET', null, { 'X-Session-Token': second.token })).status, 401);
});
test('legacy password route also revokes sessions and outstanding recovery links', async () => {
  const second = await (await request('/auth/login', 'POST', { email: 'security@example.test', password: 'changed-disposable-password' })).json();
  const user = await runtime.db.user.findUnique({ where: { email: 'security@example.test' } });
  await runtime.db.passwordRecovery.create({ data: { id: 'legacy-password-reset-link', userId: user.id, tokenHash: tokenHash('old-link'), expiresAt: new Date(Date.now() + 60000) } });
  assert.equal((await request('/settings/account/password', 'POST', { currentPassword: 'changed-disposable-password', newPassword: 'legacy-changed-password' })).status, 200);
  assert.equal((await request('/auth/session', 'GET', null, { 'X-Session-Token': second.token })).status, 401);
  assert.equal(await runtime.db.passwordRecovery.count({ where: { userId: user.id } }), 0);
});
test('browser bootstrap exchanges its legacy bearer for an HttpOnly cookie', async () => {
  const signup = await request('/auth/signup', 'POST', { name: 'Browser migration', email: 'migration@example.test', password: 'disposable-password' });
  assert.equal(signup.status, 201);
  const legacy = (await signup.json()).token;
  const response = await request('/auth/session', 'GET', null, { 'X-Session-Token': legacy, 'Sec-Fetch-Site': 'same-origin' });
  assert.equal(response.status, 200);
  const migrated = response.headers.get('set-cookie');
  assert.match(migrated, /HttpOnly/i);
  assert.equal((await request('/auth/session', 'GET', null, { 'X-Session-Token': legacy })).status, 401);
  assert.equal((await request('/auth/session', 'GET', null, { Cookie: migrated.split(';')[0], 'X-Session-Token': '' })).status, 200);
});
test('chat linking requires administrator permission and rejects anonymous channel posts', () => {
  assert.equal(discordCanManage({ guildId: 'g', member: { permissions: { has: () => true } } }), true);
  assert.equal(discordCanManage({ guildId: 'g' }), false);
  assert.equal(telegramCanManage('supergroup', 'member', 42), false);
  assert.equal(telegramCanManage('supergroup', 'administrator', 42), true);
  assert.equal(telegramCanManage('private', null, 42), true);
  assert.equal(telegramCanManage('channel', null, null), false);
});
