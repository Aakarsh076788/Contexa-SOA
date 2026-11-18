import { lockWorkspace, withWorkspaceLock } from '../services/workspace-lock.js';
import { Router } from 'express';
import { sealSecret } from '../services/secrets.js';
import { randomInt, randomBytes } from 'node:crypto';
import { tokenHash } from '../services/sessions.js';
import { id } from '../utils/id.js';
import { connectorDiagnostics } from '../services/diagnostics.js';
import { db } from '../storage/db.js';
import { githubRequest, syncGitHub } from '../engine/github.js';
import { ingest } from '../engine/ingest.js';
import { sourceName } from '../storage/workspace.js';
const presentConnector = (item) => ({ ...item, name: sourceName(item.source) });

const router = Router();

const catalog = {
  slack: { transport: 'oauth', scopes: ['selected channels', 'message references'] },
  teams: { transport: 'oauth', scopes: ['selected chats', 'meeting references'] },
  telegram: { transport: 'bot', scopes: ['approved chats', 'message references'] },
  figma: { transport: 'oauth', scopes: ['selected files', 'project names'] },
  notion: { transport: 'oauth', scopes: ['selected pages', 'databases'] },
  google_drive: { transport: 'oauth', scopes: ['selected files', 'document titles'] },
  jira: { transport: 'oauth', scopes: ['issues', 'projects'] },
  linear: { transport: 'oauth', scopes: ['issues', 'projects'] },
  terminal: { transport: 'local', scopes: ['command metadata', 'working directory'] },
  files: { transport: 'local', scopes: ['file names', 'project folders'] }
};

// GET / - get connectors
router.get('/', async (req, res, next) => {
  try {
    const { workspaceId } = req;
    const connectors = await db.connector.findMany({ where: { workspaceId } });
    return res.status(200).json(connectors.map(presentConnector));
  } catch (error) {
    next(error);
  }
});

router.get('/diagnostics', async (req, res, next) => {
  try { res.json(await connectorDiagnostics(db, req.workspaceId)); } catch (error) { next(error); }
});

function generatePairingCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[randomInt(chars.length)]).join('');
}
router.post('/pair/create', async (req, res, next) => {
  try {
    const source = req.body.source || 'chrome';
    if (!['chrome', 'vscode', 'discord', 'telegram'].includes(source)) return res.status(400).json({ error: 'That connector does not support device pairing.' });
    await db.pairingCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const expiresAt = new Date(Date.now() + 10 * 60000);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const entry = await db.pairingCode.create({ data: { code: generatePairingCode(), userId: req.user.id, workspaceId: req.workspaceId, source, expiresAt } });
        return res.status(201).json({ code: entry.code, expiresAt: expiresAt.getTime() });
      } catch (error) { if (error.code !== 'P2002') throw error; }
    }
    res.status(503).json({ error: 'Could not create pairing code. Please retry.' });
  } catch (error) { next(error); }
});
router.get('/pair/check/:code', async (req, res, next) => {
  try {
    const entry = await db.pairingCode.findUnique({ where: { code: req.params.code.trim().toUpperCase() } });
    if (!entry || entry.workspaceId !== req.workspaceId || entry.expiresAt < new Date()) return res.status(404).json({ error: 'Code not found or expired.' });
    res.json({ paired: Boolean(entry.pairedAt) });
  } catch (error) { next(error); }
});
export async function handlePairVerify(req, res, next) {
  try {
    const { code, source = 'chrome' } = req.body;
    if (typeof code !== 'string' || !/^[A-Z0-9]{6}$/i.test(code.trim())) return res.status(400).json({ error: 'Please provide a 6-character pairing code.' });
    const connectorToken = randomBytes(32).toString('hex');
    const result = await db.$transaction(async tx => {
      const normalized = code.trim().toUpperCase();
      const pending = await tx.pairingCode.findUnique({ where: { code: normalized } });
      if (!pending || pending.source !== source || pending.pairedAt || pending.expiresAt <= new Date()) return null;
      await lockWorkspace(tx, pending.workspaceId);
      const claimed = await tx.pairingCode.updateMany({ where: { code: normalized, source, pairedAt: null, expiresAt: { gt: new Date() } }, data: { pairedAt: new Date() } });
      if (claimed.count !== 1) return null;
      const entry = await tx.pairingCode.findUnique({ where: { code: normalized } });
      const device = await tx.deviceCredential.create({ data: { id: id('device'), userId: entry.userId, workspaceId: entry.workspaceId, source, label: `${source} installation`, tokenHash: tokenHash(connectorToken) } });
      const workspace = await tx.workspace.findUnique({ where: { id: entry.workspaceId } });
      const settings = workspace?.settings || {};
      await tx.workspace.update({ where: { id: entry.workspaceId }, data: { settings: { ...settings, [source]: { ...settings[source], configuredAt: new Date().toISOString() }, apps: { ...settings.apps, [source]: true } } } });
      await tx.connector.updateMany({ where: { workspaceId: entry.workspaceId, source }, data: { connected: true } });
      return device;
    });
    if (!result) return res.status(400).json({ error: 'Invalid or expired pairing code. Please generate a new code on your dashboard.' });
    res.json({ ok: true, connectorToken, deviceId: result.id, source });
  } catch (error) { next(error); }
}
router.get('/devices', async (req, res, next) => {
  try {
    const devices = await db.deviceCredential.findMany({ where: { workspaceId: req.workspaceId }, orderBy: { createdAt: 'desc' }, select: { id: true, source: true, label: true, createdAt: true, lastUsedAt: true, revokedAt: true } });
    res.json({ devices, legacyCredentialActive: Boolean(req.user.connectorToken) });
  } catch (error) { next(error); }
});
router.delete('/devices/:id', async (req, res, next) => {
  try {
    const result = await db.deviceCredential.updateMany({ where: { id: req.params.id, workspaceId: req.workspaceId }, data: { revokedAt: new Date() } });
    if (!result.count) return res.status(404).json({ error: 'Device not found.' });
    res.json({ ok: true });
  } catch (error) { next(error); }
});
router.delete('/legacy-credential', async (req, res, next) => {
  try { await db.user.update({ where: { id: req.user.id }, data: { connectorToken: null } }); res.json({ ok: true }); } catch (error) { next(error); }
});
// Legacy manual setup remains available until the owner explicitly revokes it.
router.get('/access-token', (req, res) => res.json({ token: req.user.connectorToken, legacy: true }));

// Add a catalog connector to the workspace. External OAuth or bot credentials
// are configured in the connector's own setup step; this never stores a secret.
router.post('/catalog', async (req, res, next) => {
  try {
    const { source } = req.body;
    const definition = source === 'telegram' ? catalog[source] : null;
    if (!definition) return res.status(400).json({ error: 'That connector is not in the Contexa catalog.' });
    const item = await db.connector.upsert({
      where: { workspaceId_source: { workspaceId: req.workspaceId, source } },
      update: {},
      create: { workspaceId: req.workspaceId, source, ...definition }
    });
    return res.status(201).json(presentConnector(item));
  } catch (error) {
    next(error);
  }
});

// GET /github/status - get github connection status
router.get('/github/status', async (req, res, next) => {
  try {
    const { workspaceId } = req;
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      include: { connectors: true }
    });

    const settings = typeof workspace.settings === 'object' && workspace.settings !== null ? workspace.settings : {};

    const github = workspace.connectors.find((item) => item.source === 'github');
    return res.status(200).json({
      connected: Boolean(settings?.github?.token),
      login: settings?.github?.login ?? null,
      lastSyncAt: github?.lastSyncAt ?? null
    });
  } catch (error) {
    next(error);
  }
});

// POST /github/connect - connect github with PAT
router.post('/github/connect', async (req, res, next) => {
  try {
    const { workspaceId } = req;
    const data = req.body;

    const token = String(data.token ?? '').trim();
    if (!token) return res.status(400).json({ error: 'Paste a GitHub personal access token.' });

    const profile = await githubRequest(token, '/user');

    await withWorkspaceLock(db, workspaceId, async tx => {
      const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, include: { connectors: true } });
      const settings = typeof workspace.settings === 'object' && workspace.settings !== null ? workspace.settings : {};

      const newSettings = {
        ...settings,
        github: { token: sealSecret(token), login: profile.login, connectedAt: new Date().toISOString() },
        apps: { ...(settings.apps || {}), github: true }
      };

      await tx.workspace.update({
        where: { id: workspaceId },
        data: { settings: newSettings }
      });

      const item = workspace.connectors.find((entry) => entry.source === 'github');
      if (item) {
        await tx.connector.update({
          where: { id: item.id },
          data: { connected: true }
        });
      }

    });

    return res.status(200).json({ connected: true, login: profile.login });
  } catch (error) {
    next(error);
  }
});

// POST /github/sync - sync github activity
router.post('/github/sync', async (req, res, next) => {
  try {
    const { workspaceId } = req;
    const result = await syncGitHub(workspaceId);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// GET /discord/status - get discord bot connection status
router.get('/discord/status', async (req, res, next) => {
  try {
    const { workspaceId } = req;
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      include: { connectors: true }
    });
    const settings = typeof workspace.settings === 'object' && workspace.settings !== null ? workspace.settings : {};
    const discord = workspace.connectors.find((item) => item.source === 'discord');

    return res.status(200).json({
      connected: Boolean(discord?.connected),
      channel: settings?.discord?.channel ?? 'all channels',
      lastSignalAt: discord?.lastSyncAt ?? null
    });
  } catch (error) {
    next(error);
  }
});

// POST /discord/connect - configure discord bot token & channel
router.post('/discord/connect', async (req, res, next) => {
  try {
    const { workspaceId } = req;
    const { token, channel } = req.body;

    if (!token?.trim()) {
      return res.status(400).json({ error: 'Please provide a Discord Bot Token.' });
    }

    await withWorkspaceLock(db, workspaceId, async tx => {
      const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, include: { connectors: true } });
      const settings = typeof workspace.settings === 'object' && workspace.settings !== null ? workspace.settings : {};

      const newSettings = {
        ...settings,
        discord: { token: sealSecret(token.trim()), channel: channel?.trim() || 'all', configuredAt: new Date().toISOString() },
        apps: { ...(settings.apps || {}), discord: true }
      };

      await tx.workspace.update({
        where: { id: workspaceId },
        data: { settings: newSettings }
      });

      const item = workspace.connectors.find((entry) => entry.source === 'discord');
      if (item) {
        await tx.connector.update({
          where: { id: item.id },
          data: { connected: true }
        });
      }

    });

    return res.status(200).json({ connected: true, channel: channel || 'all' });
  } catch (error) {
    next(error);
  }
});

// GET /telegram/status - get telegram connection status
router.get('/telegram/status', async (req, res, next) => {
  try {
    const { workspaceId } = req;
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      include: { connectors: true }
    });
    const settings = typeof workspace.settings === 'object' && workspace.settings !== null ? workspace.settings : {};
    const telegram = workspace.connectors.find((item) => item.source === 'telegram');

    return res.status(200).json({
      connected: Boolean(telegram?.connected),
      botUsername: settings?.telegram?.botUsername || null,
      lastSignalAt: telegram?.lastSyncAt ?? null
    });
  } catch (error) {
    next(error);
  }
});

// POST /telegram/connect - configure telegram bot token
router.post('/telegram/connect', async (req, res, next) => {
  try {
    const { workspaceId } = req;
    const { token } = req.body;

    if (!token?.trim()) {
      return res.status(400).json({ error: 'Please provide a Telegram Bot Token.' });
    }

    // Validate with Telegram Bot API
    let botUsername = 'contexa_bot';
    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${token.trim()}/getMe`, { signal: AbortSignal.timeout(8000) });
      const tgData = await tgRes.json();
      if (!tgData.ok) {
        return res.status(400).json({ error: `Invalid Telegram Bot Token: ${tgData.description || 'Verification failed.'}` });
      }
      botUsername = tgData.result.username;
    } catch (e) {
      return res.status(400).json({ error: 'Could not connect to Telegram Bot API. Please check your token and network.' });
    }

    await withWorkspaceLock(db, workspaceId, async tx => {
      const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, include: { connectors: true } });
      const settings = typeof workspace.settings === 'object' && workspace.settings !== null ? workspace.settings : {};

      const newSettings = {
        ...settings,
        telegram: { token: sealSecret(token.trim()), botUsername, configuredAt: new Date().toISOString() },
        apps: { ...(settings.apps || {}), telegram: true }
      };

      await tx.workspace.update({
        where: { id: workspaceId },
        data: { settings: newSettings }
      });

      const item = workspace.connectors.find((entry) => entry.source === 'telegram');
      if (item) {
        await tx.connector.update({
          where: { id: item.id },
          data: { connected: true }
        });
      }

    });

    return res.status(200).json({ connected: true, botUsername });
  } catch (error) {
    next(error);
  }
});

// POST /discord/simulate - simulate a team conversation in Discord
router.post('/discord/simulate', async (req, res, next) => {
  try {
    const { workspaceId } = req;
    const { channel = 'backend-dev', author = 'Teammate', message = 'Checking the auth token implementation' } = req.body;

    const activity = {
      source: 'discord',
      type: 'message_sent',
      kind: 'CONVERSATION',
      title: `#${channel} - @${author}`,
      detail: message,
      entity: `#${channel}`,
      entityType: 'channel',
      href: '',
      project: 'Discord Team'
    };

    const result = await ingest(workspaceId, activity);
    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// PUT /:source - toggle connector connected state
router.put('/:source', async (req, res, next) => {
  try {
    const { workspaceId } = req;
    const { source } = req.params;

    const updatedConnector = await withWorkspaceLock(db, workspaceId, async tx => {
      const item = await tx.connector.findFirst({ where: { workspaceId, source } });
      if (!item) throw Object.assign(new Error('Connector not found.'), { status: 404 });
      const data = req.body;
      const connected = Boolean(data.connected);
      const workspace = await tx.workspace.findUnique({ where: { id: workspaceId } });
      const settings = workspace?.settings || {};
      const isConfigured = Boolean(item.lastSyncAt || settings[source]?.token || settings[source]?.configuredAt || settings[source]?.connectedAt);
      if (connected && !isConfigured) throw Object.assign(new Error(`Setup required: Please complete the setup for ${sourceName(source)} before enabling it.`), { status: 400 });
      const updateData = { connected };
      if (Array.isArray(data.scopes)) updateData.scopes = data.scopes.filter(value => typeof value === 'string').map(value => value.slice(0, 100)).slice(0, 20);
      const updated = await tx.connector.update({ where: { id: item.id }, data: updateData });
      await tx.workspace.update({ where: { id: workspaceId }, data: { settings: { ...settings, apps: { ...settings.apps, [source]: connected } } } });
      return updated;
    });
    return res.status(200).json(presentConnector(updatedConnector));
  } catch (error) {
    next(error);
  }
});

export default router;
