const SOURCES = ['chrome', 'vscode', 'discord', 'github', 'telegram'];
export const retentionDays = { '30 days': 30, '90 days': 90, '1 year': 365, 'Keep forever': null };
export const privacyDefaults = { cloudAI: false, captureMessages: true, excludedDomains: [], excludedProjects: [] };

export function privacyFor(settings = {}) {
  return { ...privacyDefaults, ...settings.privacy };
}

export function publicSettings(settings = {}) {
  // Only expose known display fields. Never return provider tokens or internal diagnostics.
  const result = {
    tracking: settings.tracking ?? true,
    apps: Object.fromEntries(SOURCES.map(source => [source, Boolean(settings.apps?.[source])])),
    notifications: settings.notifications ?? {},
    retention: settings.retention ?? '90 days',
    privacy: privacyFor(settings)
  };
  for (const source of ['github', 'discord', 'telegram']) {
    const config = settings[source];
    if (config) result[source] = { configured: Boolean(config.token || config.configuredAt || config.connectedAt), login: config.login, channel: config.channel, botUsername: config.botUsername };
  }
  return result;
}

export function settingsUpdate(current, updates) {
  const next = { ...current };
  if (typeof updates.tracking === 'boolean') next.tracking = updates.tracking;
  if (updates.retention !== undefined) {
    if (!Object.hasOwn(retentionDays, updates.retention)) throw Object.assign(new Error('Choose a supported retention period.'), { status: 400 });
    next.retention = updates.retention;
  }
  if (updates.apps && typeof updates.apps === 'object') {
    next.apps = { ...current.apps };
    for (const source of SOURCES) if (typeof updates.apps[source] === 'boolean') next.apps[source] = updates.apps[source];
  }
  if (updates.privacy && typeof updates.privacy === 'object') {
    const privacy = privacyFor(current);
    for (const key of ['cloudAI', 'captureMessages']) if (typeof updates.privacy[key] === 'boolean') privacy[key] = updates.privacy[key];
    for (const key of ['excludedDomains', 'excludedProjects']) if (Array.isArray(updates.privacy[key])) privacy[key] = [...new Set(updates.privacy[key].filter(x => typeof x === 'string').map(x => x.trim().toLowerCase()).filter(Boolean))].slice(0, 100);
    privacy.excludedDomains = privacy.excludedDomains.map(domain => { try { return new URL(domain.includes('://') ? domain : `https://${domain.replace(/^\*\./, '')}`).hostname; } catch { return domain; } });
    next.privacy = privacy;
  }
  return next;
}

export function collectionDecision(settings, activity) {
  if (settings.tracking === false) return { allowed: false, reason: 'tracking_paused' };
  if (!settings.apps?.[activity.source]) return { allowed: false, reason: 'connector_paused' };
  const privacy = privacyFor(settings);
  const project = String(activity.project || '').toLowerCase();
  if (privacy.excludedProjects.includes(project)) return { allowed: false, reason: 'excluded_project' };
  let host = '';
  try { host = new URL(activity.href || '').hostname.toLowerCase(); } catch { /* Not a URL. */ }
  if (host && privacy.excludedDomains.some(domain => host === domain || host.endsWith(`.${domain}`))) return { allowed: false, reason: 'excluded_domain' };
  return { allowed: true };
}

export function safeHref(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'vscode:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : '';
  } catch { return ''; }
}

export function normalizeActivity(input, settings) {
  if (!input || !SOURCES.includes(input.source) || typeof input.title !== 'string' || !input.title.trim()) throw Object.assign(new Error('Activity requires a supported source and title.'), { status: 400 });
  const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
  const activity = {
    source: input.source, title: text(input.title, 500), detail: text(input.detail, 4000),
    type: text(input.type, 80) || 'activity_recorded', kind: text(input.kind, 40) || 'ACTIVITY',
    entity: text(input.entity, 500) || text(input.title, 500), entityType: text(input.entityType, 80) || 'activity',
    project: text(input.project, 200), href: safeHref(input.href),
    externalId: text(input.externalId, 200)
  };
  if (['discord', 'telegram'].includes(activity.source) && !privacyFor(settings).captureMessages) {
    const label = ['channel', 'chat'].includes(input.entityType) && typeof input.entity === 'string' ? text(input.entity, 200) : activity.source === 'discord' ? 'Discord channel' : 'Telegram chat';
    activity.entity = label;
    activity.title = `Activity in ${label}`;
    activity.detail = 'Message content collection is disabled.';
  }
  return activity;
}
