import { allowedBrowserOrigins } from './cors.js';
import { db } from '../storage/db.js';
import { ensureWorkspace } from '../storage/workspace.js';
import { findSession, sessionToken, tokenHash } from '../services/sessions.js';

export async function sessionAuth(req, res, next) {
  try {
    const token = sessionToken(req);
    
    if (!token) {
      return res.status(401).json({ error: 'Please sign in to continue.' });
    }

    const session = await findSession(token);
    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Please sign in to continue.' });
    }
    const { user, workspace } = await ensureWorkspace(session.user);
    req.sessionId = session.id;
    req.user = user;
    req.workspaceId = workspace.id;
    next();
  } catch (error) {
    next(error);
  }
}

export async function connectorAuth(req, res, next) {
  try {
    const connectorToken = req.headers['x-connector-token'];

    if (!connectorToken) {
      return res.status(401).json({ error: 'A valid connector token is required.' });
    }

    if (typeof connectorToken !== 'string' || connectorToken.length > 256) return res.status(401).json({ error: 'A valid connector token is required.' });
    const device = await db.deviceCredential.findUnique({ where: { tokenHash: tokenHash(connectorToken) } });
    if (device?.revokedAt) return res.status(401).json({ error: 'This device was disconnected. Pair it again.' });
    if (device && device.source !== '*' && device.source !== req.body?.source) return res.status(403).json({ error: 'This credential cannot capture from that source.' });
    const user = device ? await db.user.findUnique({ where: { id: device.userId } }) : await db.user.findUnique({ where: { connectorToken } });
    if (!user) {
      return res.status(401).json({ error: 'A valid connector token is required.' });
    }
    const { workspace } = await ensureWorkspace(user);
    req.workspaceId = workspace.id;
    if (device) await db.deviceCredential.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
    req.connectorSource = device?.source;
    next();
  } catch (error) {
    next(error);
  }
}

export function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

// Cookie-authenticated mutations must come from an approved browser origin.
export function browserMutationGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // These routes use explicit device credentials / one-use pairing codes, never cookies.
  if (['/api/connector-activity', '/api/connectors/pair/verify'].includes(req.originalUrl.split('?')[0])) return next();
  const origin = req.headers.origin;
  const allowed = allowedBrowserOrigins(req);
  if ((origin && !allowed.has(origin)) || req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'This request origin is not permitted.' });
  // Cross-site forms have no JSON media type; protect login/logout as well.
  if (req.headers.cookie?.includes('contexa_session=') && !origin && req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') return res.status(403).json({ error: 'Please use Contexa to make this change.' });
  next();
}
