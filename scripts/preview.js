// Isolated, disposable preview. Never connects to DATABASE_URL from .env.
import exitHook from 'async-exit-hook';
import { startTestServer } from '../tests/support/server.js';
const runtime = await startTestServer({ port: Number(process.env.PREVIEW_PORT || 4173) });
exitHook(done => { runtime.close().then(() => { console.log('Disposable preview cleaned up.'); done(); }, () => { console.error('Preview cleanup failed.'); done(); }); });
const { hashPassword } = await import('../backend/utils/crypto.js');
const user = await runtime.db.user.create({ data: { id: 'preview-user', email: 'preview@example.test', name: 'Preview User', password: await hashPassword('preview-password'), role: 'user', connectorToken: 'preview-connector-token' } });
const { ensureWorkspace } = await import('../backend/storage/workspace.js');
const { workspace } = await ensureWorkspace(user);
await runtime.db.workspace.update({ where: { id: workspace.id }, data: { settings: { ...workspace.settings, apps: { chrome: true, vscode: true }, privacy: { cloudAI: false, captureMessages: true } } } });
await runtime.db.connector.updateMany({ where: { workspaceId: workspace.id, source: { in: ['chrome', 'vscode'] } }, data: { connected: true } });
const context = await runtime.db.context.create({ data: { id: 'preview-context', workspaceId: workspace.id, name: 'Authentication refresh', topic: 'Fix token expiration in the customer portal', description: 'Research and implementation for a smoother sign-in flow.', state: 'IMPLEMENTATION', confidence: 78, sources: ['chrome', 'vscode'], embedding: [], tint: 'violet', sessionNote: 'The refresh token expires before the browser session. Confirm the retry behavior before merging.', nextAction: 'Add a regression test for an expired refresh token.' } });
for (const [i, source, title, detail, href] of [
  [1, 'chrome', 'JWT token expiration reference', 'Reviewed token lifetime and refresh behavior.', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication'],
  [2, 'vscode', 'Saved src/auth/refresh.js', 'customer-portal · JavaScript', ''],
  [3, 'chrome', 'Retry behavior after a 401 response', 'Compared refresh retry patterns.', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/401']
]) {
  const entity = await runtime.db.entity.create({ data: { id: `preview-entity-${i}`, workspaceId: workspace.id, contextId: context.id, source, type: source === 'chrome' ? 'webpage' : 'file', label: title, href, metadata: { explanation: { method: 'hybrid-v2', score: 78, outcome: 'MERGE', reasons: ['Shared authentication topic.', 'Part of the customer portal workflow.'] } } } });
  await runtime.db.event.create({ data: { id: `preview-event-${i}`, workspaceId: workspace.id, contextId: context.id, source, type: 'activity_recorded', kind: source === 'vscode' ? 'IMPLEMENTATION' : 'RESEARCH', title, detail, entityId: entity.id, embedding: [], createdAt: new Date(Date.now() - (4 - i) * 1800000) } });
}
const entity = await runtime.db.entity.create({ data: { id: 'preview-unassigned-entity', workspaceId: workspace.id, source: 'chrome', type: 'webpage', label: 'API rate limit notes', href: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/429', metadata: {} } });
await runtime.db.event.create({ data: { id: 'preview-unassigned', workspaceId: workspace.id, source: 'chrome', type: 'page_opened', kind: 'RESEARCH', title: 'API rate limit notes', detail: 'An isolated research signal ready for review.', entityId: entity.id, embedding: [] } });
console.log(`Disposable preview: ${runtime.url}`);
console.log('Sign in: preview@example.test / preview-password');
