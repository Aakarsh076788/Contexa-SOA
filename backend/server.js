import express from 'express';
import eventsRoutes from './routes/events.js';
import { startRetention } from './services/retention.js';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { cors } from './middleware/cors.js';
import { errorHandler } from './middleware/error.js';
import { sessionAuth, browserMutationGuard } from './middleware/auth.js';
import { now } from './utils/format.js';

// Route modules
import authRoutes from './routes/auth.js';
import activityRoutes from './routes/activity.js';
import searchRoutes from './routes/search.js';
import contextsRoutes from './routes/contexts.js';
import connectorsRoutes, { handlePairVerify } from './routes/connectors.js';
import settingsRoutes from './routes/settings.js';
import workspaceRoutes from './routes/workspace.js';
import accountRoutes from './routes/account.js';
import adminRoutes from './routes/admin.js';
import { adminAuth } from './middleware/admin.js';
import { rebuildContextAssignments } from './engine/rebuild.js';
import { db } from './storage/db.js';
import { runtimeConfig, createReadinessCheck, requestTelemetry } from './services/runtime.js';
import { startIngestionWorker } from './services/ingestion-queue.js';

// Initialize connectors
import './connectors/index.js';

export const app = express();
const configuration = runtimeConfig();
app.set('trust proxy', configuration.proxyHops);
app.disable('x-powered-by');

// ─── Rate Limiters ───────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' }
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' }
});

// ─── Global Middleware ───────────────────────────────────────────
app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://accounts.google.com'],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:', 'https://*.googleusercontent.com'],
    frameSrc: ['https://accounts.google.com'], connectSrc: ["'self'", 'https://accounts.google.com'],
    upgradeInsecureRequests: null
  } }
}));
app.use(cors);
app.use(requestTelemetry);
app.use(express.json({ limit: '1mb' }));
app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); req.body ??= {}; next(); });
app.use('/api', browserMutationGuard);

// ─── Health Check (no auth) ──────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'contexa-api', time: now() });
});
const readiness = createReadinessCheck(db);
app.get('/api/ready', async (req, res) => {
  const result = await readiness();
  res.status(result.ok ? 200 : 503).json(result);
});

// ─── Public Routes (no auth) ────────────────────────────────────
app.use('/api/auth', (req, res, next) => req.method === 'GET' ? apiLimiter(req, res, next) : authLimiter(req, res, next), authRoutes);
const pairLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many pairing attempts. Try again later.' } });
app.post('/api/connectors/pair/verify', pairLimiter, handlePairVerify);

// ─── Connector Routes (connector token auth, handled per-route) ─
app.use('/api', apiLimiter, activityRoutes);

// ─── Authenticated Routes (session auth) ─────────────────────────
app.use('/api/workspace', apiLimiter, sessionAuth, workspaceRoutes);
app.use('/api/contexts', apiLimiter, sessionAuth, contextsRoutes);
app.use('/api/connectors', apiLimiter, sessionAuth, connectorsRoutes);
app.use('/api/settings', apiLimiter, sessionAuth, settingsRoutes);
app.use('/api/search', apiLimiter, sessionAuth, searchRoutes);
app.use('/api/account', apiLimiter, sessionAuth, accountRoutes);
app.use('/api/admin', apiLimiter, adminAuth, adminRoutes);
app.post('/api/context-engine/rebuild', sessionAuth, async (req, res, next) => { try { res.json(await rebuildContextAssignments(req.workspaceId)); } catch (error) { next(error); } });
app.use('/api/events', apiLimiter, sessionAuth, eventsRoutes);

// ─── Serve Frontend in Production ──────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, '../dist')));

// ─── 404 Fallback for API ────────────────────────────────────────
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// ─── Catch-all for Frontend Routing ──────────────────────────────
app.use((req, res, next) => {
  if (req.method === 'GET') {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  } else {
    next();
  }
});

// ─── Error Handler ───────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ────────────────────────────────────────────────
// Importing the app in tests does not bind a port or start scheduled deletion.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = app.listen(configuration.port, configuration.host, () => {
    console.log(`Contexa API listening on port ${configuration.port}`);
  });
  const retention = startRetention(db);
  const ingestion = startIngestionWorker(db);
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 30000); timeout.unref();
    try { await Promise.all([new Promise(resolve => server.close(resolve)), ingestion.stop(), retention.stop()]); await db.$disconnect(); clearTimeout(timeout); }
    catch { process.exitCode = 1; }
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
