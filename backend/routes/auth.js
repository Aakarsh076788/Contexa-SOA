import { Router } from 'express';
import { verifyGoogleCredential } from '../services/google-auth.js';
import { db } from '../storage/db.js';
import { hashPassword, verifyPassword } from '../utils/crypto.js';
import { id } from '../utils/id.js';
import { publicUser, sessionAuth } from '../middleware/auth.js';
import { ensureWorkspace } from '../storage/workspace.js';
import { randomBytes } from 'node:crypto';

import { createSession, clearSession, findSession, sessionToken } from '../services/sessions.js';
import { recoveryAvailable, recoveryMessage, requestRecovery, resetPassword } from '../services/recovery.js';
const router = Router();
router.get('/recovery/status', (req, res) => res.json({ available: recoveryAvailable() }));
router.post('/recovery/request', async (req, res, next) => {
  // Respond before account lookup/delivery so email-provider latency cannot be
  // used to distinguish registered accounts. A failed send never claims success.
  const email = typeof req.body.email === 'string' ? req.body.email.slice(0, 254) : '';
  res.status(202).json({ message: recoveryMessage });
  setImmediate(() => requestRecovery(db, email).catch(() => console.error(JSON.stringify({ event: 'recovery_request_failed' }))));
});
router.post('/recovery/reset', async (req, res, next) => {
  try { await resetPassword(db, req.body.token, req.body.password); clearSession(res); res.json({ ok: true }); }
  catch (error) { next(error); }
});
router.get('/session', sessionAuth, async (req, res, next) => {
  try {
    if (req.headers['x-session-token'] && (req.headers.origin || req.headers['sec-fetch-site']) && !req.headers.cookie?.includes('contexa_session=')) {
      await createSession(res, req.user.id);
      await db.session.deleteMany({ where: { id: req.sessionId } });
    }
    res.json({ user: publicUser(req.user) });
  } catch (error) { next(error); }
});

// POST /signup
router.post('/signup', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== 'string' || password.length < 8 || password.length > 1024) {
      return res.status(400).json({ error: 'Name, a valid email, and an 8+ character password are required.' });
    }
    
    const emailLower = email.trim().toLowerCase();
    const existingUser = await db.user.findFirst({ where: { email: emailLower } });
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    
    const userId = id('user');
    
    const user = await db.user.create({
      data: {
        id: userId,
        name: name.trim().slice(0, 80),
        email: emailLower,
        password: await hashPassword(password),
        connectorToken: randomBytes(32).toString('hex')
      }
    });
    await ensureWorkspace(user);
    const token = await createSession(res, user.id);
    return res.status(201).json({ user: publicUser(user), token: req.headers.origin || req.headers['sec-fetch-site'] ? null : token });
  } catch (error) {
    next(error);
  }
});

// POST /login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string' || password.length > 1024) return res.status(400).json({ error: 'Enter your email and password.' });
    const user = await db.user.findFirst({ where: { email: String(email).trim().toLowerCase() } });
    
    const isPasswordValid = user ? await verifyPassword(password ?? '', user.password) : false;
    
    if (!user || !isPasswordValid) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    
    await ensureWorkspace(user);
    const token = await createSession(res, user.id);
    return res.status(200).json({ user: publicUser(user), token: req.headers.origin || req.headers['sec-fetch-site'] ? null : token });
  } catch (error) {
    next(error);
  }
});

// POST /logout
router.post('/logout', async (req, res, next) => {
  try {
    const session = await findSession(sessionToken(req));
    if (session) await db.session.deleteMany({ where: { id: session.id } });
    clearSession(res);
    return res.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// POST /google — Google Sign-In
router.post('/google', async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Google credential is required.' });

    const payload = await verifyGoogleCredential(credential);

    const email = payload.email?.toLowerCase();
    const name = payload.name || email?.split('@')[0] || 'Google User';

    if (!email) return res.status(400).json({ error: 'Could not extract email from Google token.' });

    // Find or create user
    let user = await db.user.findFirst({ where: { email } });
    if (!user) {
      user = await db.user.create({
        data: {
          id: id('user'),
          name: name.slice(0, 80),
          email,
          password: await hashPassword(randomBytes(32).toString('hex')), // random password for Google users
          connectorToken: randomBytes(32).toString('hex')
        }
      });
    }
    await ensureWorkspace(user);

    const token = await createSession(res, user.id);
    return res.status(200).json({ user: publicUser(user), token: req.headers.origin || req.headers['sec-fetch-site'] ? null : token });
  } catch (error) {
    next(error);
  }
});

export default router;
