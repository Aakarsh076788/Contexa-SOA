import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { hashPassword } from '../utils/crypto.js';

const digest = value => createHash('sha256').update(value).digest('hex');
export const recoveryMessage = 'If an account matches that email and recovery is available, you will receive a password reset link shortly.';
export function recoveryAvailable(env = process.env) {
  try {
    const origin = new URL(env.PUBLIC_ORIGIN || '');
    return Boolean(env.RESEND_API_KEY && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.RECOVERY_FROM_EMAIL || '') && origin.protocol === 'https:' && origin.origin === env.PUBLIC_ORIGIN);
  } catch { return false; }
}

export async function sendRecoveryEmail({ email, link }, env = process.env) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.RECOVERY_FROM_EMAIL, to: [email], subject: 'Reset your Contexa password', text: `Use this link to choose a new password:\n\n${link}\n\nThis link expires in 20 minutes and works once. If you did not request it, you can ignore this email.` })
  });
  if (!response.ok) throw new Error('Recovery email delivery failed.');
}

// Dependencies are injectable so tests never send messages or connect to user data.
export async function requestRecovery(database, email, { env = process.env, send = sendRecoveryEmail, clock = new Date() } = {}) {
  if (!recoveryAvailable(env)) return;
  const address = typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return;
  const user = await database.user.findUnique({ where: { email: address }, select: { id: true, email: true } });
  if (!user) return;
  const token = randomBytes(32).toString('hex');
  const record = await database.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
    const recent = await tx.passwordRecovery.findFirst({ where: { userId: user.id, createdAt: { gt: new Date(clock.getTime() - 60000) } } });
    if (recent) return null;
    await tx.passwordRecovery.deleteMany({ where: { userId: user.id } });
    return tx.passwordRecovery.create({ data: { id: randomUUID(), userId: user.id, tokenHash: digest(token), createdAt: clock, expiresAt: new Date(clock.getTime() + 20 * 60000) } });
  });
  if (!record) return;
  try {
    await send({ email: user.email, link: `${env.PUBLIC_ORIGIN}/reset-password#token=${token}` }, env);
  } catch {
    await database.passwordRecovery.deleteMany({ where: { id: record.id } });
    console.error(JSON.stringify({ event: 'recovery_delivery_failed' }));
  }
}

export async function resetPassword(database, token, password, clock = new Date()) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) throw Object.assign(new Error('This reset link is invalid or expired. Request a new one.'), { status: 400 });
  if (typeof password !== 'string' || password.length < 8 || password.length > 1024) throw Object.assign(new Error('Choose a password with at least 8 characters.'), { status: 400 });
  const hash = await hashPassword(password);
  await database.$transaction(async tx => {
    const recovery = await tx.passwordRecovery.findUnique({ where: { tokenHash: digest(token) } });
    if (!recovery || recovery.usedAt || recovery.expiresAt <= clock) throw Object.assign(new Error('This reset link is invalid or expired. Request a new one.'), { status: 400 });
    const claimed = await tx.passwordRecovery.updateMany({ where: { id: recovery.id, usedAt: null, expiresAt: { gt: clock } }, data: { usedAt: clock } });
    if (claimed.count !== 1) throw Object.assign(new Error('This reset link was already used. Request a new one.'), { status: 400 });
    await tx.user.update({ where: { id: recovery.userId }, data: { password: hash } });
    await tx.session.deleteMany({ where: { userId: recovery.userId } });
    await tx.passwordRecovery.deleteMany({ where: { userId: recovery.userId } });
  });
}
