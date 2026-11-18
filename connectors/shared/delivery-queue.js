import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { sealSecret, openSecret } from '../../backend/services/secrets.js';
// Local bounded queue is encrypted with CONTEXA_SECRET_KEY. Never use a plaintext fallback.
export function createDeliveryQueue(file, deliver, { now = Date.now, limit = 200, ttl = 86400000 } = {}) {
  let entries = [], running = false;
  try { entries = JSON.parse(openSecret(readFileSync(file, 'utf8'))); } catch { /* absent or unreadable queue */ }
  if (!Array.isArray(entries)) entries = [];
  const persist = () => {
    const sealed = sealSecret(JSON.stringify(entries));
    if (!sealed.startsWith('enc:v1:')) throw new Error('CONTEXA_SECRET_KEY is required for durable bot delivery.');
    writeFileSync(`${file}.tmp`, sealed, { mode: 0o600 }); renameSync(`${file}.tmp`, file);
  };
  async function flush() {
    if (running) return;
    running = true;
    try {
      entries = entries.filter(entry => now() - entry.at < ttl);
      for (const entry of [...entries]) {
        if (!entries.includes(entry) || entry.nextAt > now()) continue;
        let response;
        try { response = await deliver(entry.payload, entry.token); } catch { response = { ok: false, status: 503 }; }
        if (response.ok || (response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status))) entries = entries.filter(item => item !== entry);
        else { entry.attempts++; entry.nextAt = now() + Math.min(300000, 1000 * 2 ** Math.min(entry.attempts, 9)); }
      }
      persist();
    } catch { /* keep encrypted queue and retry on next tick */ }
    finally { running = false; }
  }
  return {
    async add(payload, token) {
      entries.push({ payload, token, at: now(), nextAt: now(), attempts: 0 });
      entries = entries.slice(-limit);
      persist(); await flush();
    },
    flush,
    removeToken(token) { entries = entries.filter(item => item.token !== token); persist(); }
  };
}
