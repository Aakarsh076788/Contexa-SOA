import { createHash, randomBytes } from 'node:crypto';
import { db } from '../storage/db.js';
export const SESSION_COOKIE = 'contexa_session';
export const tokenHash = value => createHash('sha256').update(value).digest('hex');
export function sessionToken(req) {
  const raw = String(req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${SESSION_COOKIE}=`));
  return raw ? raw.slice(SESSION_COOKIE.length + 1) : req.headers['x-session-token'];
}
export async function findSession(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) return null;
  const hashed = `sha256:${tokenHash(token)}`;
  let session = await db.session.findUnique({ where: { id: hashed }, include: { user: true } });
  if (!session) {
    // Existing installations retain their sessions; upgrade storage on first use.
    session = await db.session.findUnique({ where: { id: token }, include: { user: true } });
    if (session) {
      await db.session.updateMany({ where: { id: token }, data: { id: hashed } });
      session.id = hashed;
    }
  }
  return session;
}
export async function createSession(res, userId) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 86400000);
  await db.session.create({ data: { id: `sha256:${tokenHash(token)}`, userId, expiresAt } });
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires: expiresAt });
  return token;
}
export function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
}
