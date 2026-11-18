const defaultSettings = { apiBase: 'http://127.0.0.1:4000', sessionToken: '', enabled: false };

async function settings() { return { ...defaultSettings, ...(await chrome.storage.local.get(defaultSettings)) }; }

function searchTerms(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('q') || parsed.searchParams.get('query') || parsed.searchParams.get('search') || '';
  } catch { return ''; }
}

function isContexaInternal(url, title) {
  const host = url.hostname.toLowerCase();
  const t = (title || '').trim().toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') {
    return true;
  }
  if (host.includes('contexa.app') || host.includes('contexa.ai') || host.includes('contexa.dev')) {
    return true;
  }
  if (t === 'contexa' || t.startsWith('contexa /') || t.startsWith('contexa -') || t.includes('workspace memory')) {
    return true;
  }
  return false;
}

async function capture(tab, type) {
  if (!tab?.url || tab.incognito || !/^https?:\/\//.test(tab.url)) return;
  const config = await settings();
  if (!config.enabled || !config.sessionToken) return;
  const url = new URL(tab.url);
  const title = tab.title?.trim() || url.hostname;

  // Never track Contexa website itself
  if (isContexaInternal(url, title)) return;

  const query = searchTerms(tab.url);
  const payload = {
    externalId: crypto.randomUUID(), source: 'chrome', type, kind: 'BROWSER', title,
    detail: `${url.hostname}${query ? ` · search: ${query.slice(0, 120)}` : ''}`,
    entity: title, entityType: 'webpage', href: url.origin + url.pathname,
    project: url.hostname, keywords: query ? query.split(/\s+/).slice(0, 12) : []
  };
  await serial(async () => {
    const { deliveryQueue = [] } = await chrome.storage.local.get('deliveryQueue');
    await chrome.storage.local.set({ deliveryQueue: [...deliveryQueue, { payload, at: Date.now(), nextAt: 0, attempts: 0, identity: config.sessionToken, apiBase: config.apiBase }].slice(-200) });
  });
  await flush();
}

chrome.tabs.onActivated.addListener(({ tabId }) => { chrome.tabs.get(tabId).then((tab) => capture(tab, 'tab_activated')).catch(() => {}); });
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => { if (changeInfo.status === 'complete') capture(tab, 'page_opened'); });

// Serialise storage writes so simultaneous tab events cannot overwrite queued work.
let chain = Promise.resolve();
function serial(task) { const result = chain.then(task); chain = result.catch(() => {}); return result; }
function flush() { return serial(async () => {
  const config = await settings();
  let { deliveryQueue = [] } = await chrome.storage.local.get('deliveryQueue');
  if (!config.enabled || !config.sessionToken) { await chrome.storage.local.remove('deliveryQueue'); return; }
  deliveryQueue = deliveryQueue.filter(item => Date.now() - item.at < 86400000 && item.identity === config.sessionToken && item.apiBase === config.apiBase);
  for (const entry of [...deliveryQueue]) {
    if (entry.nextAt > Date.now()) continue;
    try {
      const response = await fetch(`${config.apiBase}/api/connector-activity`, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', 'X-Connector-Token': config.sessionToken }, body: JSON.stringify(entry.payload) });
      if (!response.ok) {
        if ([401, 403].includes(response.status)) { deliveryQueue = []; await chrome.storage.local.set({ lastCaptureError: 'Device disconnected. Pair again.' }); break; }
        if (response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status)) { deliveryQueue = deliveryQueue.filter(item => item !== entry); continue; }
        throw new Error('Retry');
      }
      const result = await response.json();
      deliveryQueue = deliveryQueue.filter(item => item !== entry);
      if (result.ignored && /paused|disabled/.test(result.reason || '')) deliveryQueue = [];
      await chrome.storage.local.set({ ...(!result.ignored ? { lastCaptureAt: new Date().toISOString() } : {}), lastCaptureStatus: (result.accepted && result.jobId) ? 'Queued for processing' : result.ignored ? (result.reason || 'Filtered').replaceAll('_', ' ') : 'Activity received', lastCaptureError: '' });
    } catch {
      entry.attempts++; entry.nextAt = Date.now() + Math.min(300000, 1000 * 2 ** Math.min(entry.attempts, 9));
      await chrome.storage.local.set({ lastCaptureError: 'Offline. Activity will retry automatically for up to 24 hours.' });
      break;
    }
  }
  await chrome.storage.local.set({ deliveryQueue, queuedCount: deliveryQueue.length });
}); }
chrome.alarms.create('contexa-delivery', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'contexa-delivery') flush(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.enabled || changes.sessionToken || changes.apiBase)) serial(() => chrome.storage.local.set({ deliveryQueue: [], queuedCount: 0 }));
});
flush();
