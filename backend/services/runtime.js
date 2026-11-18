import { randomUUID } from 'node:crypto';
import { safeErrorDetails } from '../utils/diagnostics.js';

export function runtimeConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const port = Number(env.PORT ?? 4000);
  const proxyHops = Number(env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be a valid TCP port.');
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 5) throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 5 matching your reverse proxy.');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL must be configured.');
  let database;
  try { database = new URL(env.DATABASE_URL); } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL.'); }
  if (!['postgres:', 'postgresql:'].includes(database.protocol)) throw new Error('DATABASE_URL must use PostgreSQL.');
  if (production) {
    if (!/^[a-f0-9]{64}$/i.test(env.CONTEXA_SECRET_KEY || '')) throw new Error('Production requires a stable 64-character hexadecimal CONTEXA_SECRET_KEY.');
    let origin;
    try { origin = new URL(env.PUBLIC_ORIGIN || env.CORS_ORIGIN || ''); } catch { throw new Error('Production requires PUBLIC_ORIGIN to be an exact HTTPS origin.'); }
    if (origin.protocol !== 'https:' || origin.origin !== (env.PUBLIC_ORIGIN || env.CORS_ORIGIN) || origin.username || origin.password) throw new Error('Production requires PUBLIC_ORIGIN to be an exact HTTPS origin.');
  }
  return { production, port, host: env.HOST || '127.0.0.1', proxyHops };
}

// Liveness is intentionally independent of dependencies. Readiness checks the
// database and schema, coalesces concurrent probes and never discloses data.
export function createReadinessCheck(database, { timeoutMs = 2000, cacheMs = 500 } = {}) {
  let pending, lastResult, checkedAt = 0;
  return async () => {
    if (lastResult && Date.now() - checkedAt < cacheMs) return lastResult;
    if (pending) return pending;
    pending = (async () => {
      let timer;
      try {
        await Promise.race([
          Promise.all([
            database.user.findFirst({ select: { id: true, role: true } }),
            database.$queryRaw`SELECT "id" FROM "DeviceCredential" LIMIT 0`,
            database.$queryRaw`SELECT "code" FROM "PairingCode" LIMIT 0`,
            database.$queryRaw`SELECT "id" FROM "IngestionJob" LIMIT 0`,
            database.$queryRaw`SELECT "id" FROM "PasswordRecovery" LIMIT 0`
          ]),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Readiness timed out')), timeoutMs); })
        ]);
        lastResult = { ok: true, service: 'contexa-api', database: 'ready' };
      } catch (error) {
        console.error(JSON.stringify({ event: 'readiness_check_failed', error: safeErrorDetails(error) }));
        lastResult = { ok: false, service: 'contexa-api', database: 'unavailable', error: 'Database or required schema is unavailable.' };
      } finally { clearTimeout(timer); checkedAt = Date.now(); }
      return lastResult;
    })();
    try { return await pending; } finally { pending = null; }
  };
}

export function requestTelemetry(req, res, next) {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  const started = performance.now();
  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test' || !req.path.startsWith('/api') || ['/api/health', '/api/ready'].includes(req.path)) return;
    // No query strings, bodies, tokens, content or user identifiers in logs.
    const route = req.route?.path;
    console.log(JSON.stringify({ level: res.statusCode >= 500 ? 'error' : 'info', event: 'http_request', requestId: req.requestId, method: req.method, route: typeof route === 'string' ? `${req.baseUrl || ''}${route}` : 'api', status: res.statusCode, durationMs: Math.round(performance.now() - started) }));
  });
  next();
}
