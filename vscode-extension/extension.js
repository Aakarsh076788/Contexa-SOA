const vscode = require('vscode');
const lastCaptured = new Map();
let activeContext, status;
const config = () => vscode.workspace.getConfiguration('contexa');
const workspaceName = document => vscode.workspace.getWorkspaceFolder(document.uri)?.name || vscode.workspace.name || 'VS Code workspace';
async function connectorToken() { return await activeContext.secrets.get('contexa.connectorToken') || config().get('sessionToken'); }
async function send(document, type) {
  if (!document || document.isUntitled || document.uri.scheme !== 'file' || !config().get('enabled')) return;
  const token = await connectorToken();
  if (!token) return;
  const relative = vscode.workspace.asRelativePath(document.uri, false);
  const key = `${type}:${document.uri.toString()}`;
  if (Date.now() - (lastCaptured.get(key) || 0) < (type === 'file_saved' ? 15000 : 45000)) return;
  const payload = { externalId: require('node:crypto').randomUUID(), source: 'vscode', type, kind: type === 'file_saved' ? 'IMPLEMENTATION' : 'EDITOR', title: `${type === 'file_saved' ? 'Saved' : 'Opened'} ${relative}`, detail: `${workspaceName(document)} · ${document.languageId}`, entity: relative, entityType: 'file', project: workspaceName(document) };
  lastCaptured.set(key, Date.now());
  await serial(async () => {
    const identity = require('node:crypto').createHash('sha256').update(token).digest('hex');
    const queue = activeContext.globalState.get('contexa.deliveryQueue', []);
    await activeContext.globalState.update('contexa.deliveryQueue', [...queue, { payload, at: Date.now(), nextAt: 0, attempts: 0, identity, apiBase: config().get('apiBase') }].slice(-200));
  });
  await flush();
}
async function saveToken(token) {
  await serial(() => activeContext.globalState.update('contexa.deliveryQueue', []));
  await activeContext.secrets.store('contexa.connectorToken', token);
  // SecretsStorage replaces the plaintext setting for newly paired installations.
  await config().update('sessionToken', undefined, vscode.ConfigurationTarget.Global);
  await config().update('enabled', true, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage('Contexa connected. Open or save a file to capture activity.');
}
function activate(context) {
  activeContext = context;
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.text = '$(history) Contexa'; status.command = 'contexa.pair'; status.tooltip = 'Pair Contexa or check capture status'; status.show();
  context.subscriptions.push(status,
    vscode.commands.registerCommand('contexa.setDeviceToken', async () => {
      const token = await vscode.window.showInputBox({ title: 'Contexa: Set Device Token', prompt: 'Paste the connector token from Contexa setup.', password: true, ignoreFocusOut: true });
      if (token?.trim()) await saveToken(token.trim());
    }),
    vscode.commands.registerCommand('contexa.pair', async () => {
      const code = await vscode.window.showInputBox({ title: 'Contexa: Pair Workspace', prompt: 'Enter the 6-character code from Connectors → VS Code.', validateInput: value => /^[A-Za-z0-9]{6}$/.test(value.trim()) ? null : 'Enter all 6 characters.' });
      if (!code) return;
      try {
        const response = await fetch(`${config().get('apiBase').replace(/\/$/, '')}/api/connectors/pair/verify`, { method: 'POST', signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim().toUpperCase(), source: 'vscode' }) });
        const result = await response.json();
        if (!response.ok || !result.connectorToken) throw new Error(result.error || 'Pairing failed.');
        await saveToken(result.connectorToken);
      } catch (error) { vscode.window.showErrorMessage(`Contexa: ${error.message}`); }
    }),
    vscode.window.onDidChangeActiveTextEditor(editor => editor && send(editor.document, 'file_opened')),
    vscode.workspace.onDidSaveTextDocument(document => send(document, 'file_saved'))
  );
  const retry = setInterval(() => flush(), 30000);
  context.subscriptions.push({ dispose: () => clearInterval(retry) }, vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('contexa')) serial(() => activeContext.globalState.update('contexa.deliveryQueue', [])); }));
  flush();
  if (vscode.window.activeTextEditor) send(vscode.window.activeTextEditor.document, 'file_opened');
}
function deactivate() {}
module.exports = { activate, deactivate };

let deliveryChain = Promise.resolve();
function serial(task) { const next = deliveryChain.then(task); deliveryChain = next.catch(() => {}); return next; }
function flush() { return serial(async () => {
  if (!activeContext) return;
  const token = await connectorToken();
  if (!config().get('enabled') || !token) { await activeContext.globalState.update('contexa.deliveryQueue', []); return; }
  const identity = require('node:crypto').createHash('sha256').update(token).digest('hex');
  let queue = activeContext.globalState.get('contexa.deliveryQueue', []).filter(entry => Date.now() - entry.at < 86400000 && entry.identity === identity && entry.apiBase === config().get('apiBase'));
  for (const entry of [...queue]) {
    if (entry.nextAt > Date.now()) continue;
    try {
      const response = await fetch(`${config().get('apiBase').replace(/\/$/, '')}/api/connector-activity`, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', 'X-Connector-Token': token }, body: JSON.stringify(entry.payload) });
      if (!response.ok) {
        if ([401, 403].includes(response.status)) { queue = []; status.text = '$(warning) Contexa: pair again'; break; }
        if (response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status)) { queue = queue.filter(item => item !== entry); continue; }
        throw new Error('Retry');
      }
      const result = await response.json();
      queue = queue.filter(item => item !== entry);
      if (result.ignored && /paused|disabled/.test(result.reason || '')) queue = [];
      status.text = result.ignored ? '$(circle-slash) Contexa: paused or filtered' : '$(check) Contexa';
      status.tooltip = (result.accepted && result.jobId) ? 'Received; processing in the background.' : `Last delivery: ${new Date().toLocaleTimeString()}`;
    } catch {
      entry.attempts++; entry.nextAt = Date.now() + Math.min(300000, 1000 * 2 ** Math.min(entry.attempts, 9));
      status.text = '$(warning) Contexa: retrying'; status.tooltip = `${queue.length} queued. Retries for up to 24 hours; disabling capture clears pending activity.`;
      break;
    }
  }
  await activeContext.globalState.update('contexa.deliveryQueue', queue);
}); }
