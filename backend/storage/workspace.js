import { withWorkspaceLock } from '../services/workspace-lock.js';
import { db } from './db.js';
import { date, time } from '../utils/format.js';
import { sealSecret } from '../services/secrets.js';
import { privacyDefaults } from '../services/privacy.js';

export const defaultSettings = {
  tracking: true,
  privacy: privacyDefaults,
  apps: { chrome: false, vscode: false, discord: false, github: false, telegram: false },
  notifications: { switches: true, weekly: true, reminders: false },
  retention: '90 days'
};

const connectorDefaults = [
  { source: 'chrome', transport: 'extension', connected: false, scopes: ['page titles', 'domains', 'search query terms'] },
  { source: 'vscode', transport: 'extension', connected: false, scopes: ['workspace name', 'active file', 'save events'] },
  { source: 'discord', transport: 'bot', connected: false, scopes: ['selected server channels'] },
  { source: 'github', transport: 'oauth', connected: false, scopes: ['repositories', 'issues', 'pull requests'] },
  { source: 'telegram', transport: 'bot', connected: false, scopes: ['group chats', 'direct messages'] }
];

export const sourceName = (source) => ({ chrome: 'Chrome', vscode: 'VS Code', discord: 'Discord', github: 'GitHub', slack: 'Slack', teams: 'Microsoft Teams', telegram: 'Telegram', figma: 'Figma', notion: 'Notion', google_drive: 'Google Drive', jira: 'Jira', linear: 'Linear', terminal: 'Terminal', files: 'Files' })[source] ?? source;

export function settingsFor(value) {
  const stored = value && typeof value === 'object' ? value : {};
  return {
    ...defaultSettings,
    ...stored,
    privacy: { ...privacyDefaults, ...(stored.privacy ?? {}) },
    apps: { ...defaultSettings.apps, ...(stored.apps ?? {}) },
    notifications: { ...defaultSettings.notifications, ...(stored.notifications ?? {}) }
  };
}

export async function ensureWorkspace(user) {
  let workspace = await db.workspace.findUnique({ where: { userId: user.id }, include: { connectors: true } });
  if (!workspace) {
    workspace = await db.workspace.create({
      data: {
        userId: user.id,
        settings: defaultSettings,
        connectors: { create: connectorDefaults }
      },
      include: { connectors: true }
    });
  } else {
    const settings = settingsFor(workspace.settings);
    for (const source of ['github', 'discord', 'telegram']) {
      if (settings[source]?.token && !settings[source].token.startsWith('enc:v1:')) settings[source] = { ...settings[source], token: sealSecret(settings[source].token) };
    }
    if (JSON.stringify(settings) !== JSON.stringify(workspace.settings)) {
      workspace = await withWorkspaceLock(db, workspace.id, async tx => {
        const latest = await tx.workspace.findUnique({ where: { id: workspace.id }, include: { connectors: true } });
        const current = settingsFor(latest.settings);
        for (const source of ['github', 'discord', 'telegram']) {
          if (current[source]?.token && !current[source].token.startsWith('enc:v1:')) current[source] = { ...current[source], token: sealSecret(current[source].token) };
        }
        return tx.workspace.update({ where: { id: workspace.id }, data: { settings: current }, include: { connectors: true } });
      });
    }
    const existing = new Set(workspace.connectors.map((item) => item.source));
    const missing = connectorDefaults.filter((item) => !existing.has(item.source));
    if (missing.length) {
      await db.connector.createMany({ data: missing.map((item) => ({ ...item, workspaceId: workspace.id })), skipDuplicates: true });
      workspace = await db.workspace.findUnique({ where: { id: workspace.id }, include: { connectors: true } });
    }
  }
  return { user, workspace };
}

export function presentEvent(event) {
  const { embedding, entity, ...safe } = event;
  return { ...safe, explanation: entity?.metadata?.explanation || null, href: entity?.href || '', day: date(event.createdAt), time: time(event.createdAt) };
}

export function presentContext(context, events = []) {
  const sources = [...new Set(events.map((event) => event.source))];
  const { embedding, _count, ...safe } = context;
  return { ...safe, sources: context.sources?.length ? context.sources : sources, eventCount: _count?.events ?? events.length };
}
