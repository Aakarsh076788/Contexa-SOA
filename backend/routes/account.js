import { Router } from 'express';
import { db } from '../storage/db.js';
import { hashPassword, verifyPassword } from '../utils/crypto.js';

const router = Router();
router.get('/sessions', async (req, res, next) => {
  try {
    const sessions = await db.session.findMany({ where: { userId: req.user.id, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, expiresAt: true } });
    res.json({ sessions: sessions.map(item => ({ createdAt: item.createdAt, expiresAt: item.expiresAt, current: item.id === req.sessionId })) });
  } catch (error) { next(error); }
});
router.delete('/sessions/others', async (req, res, next) => {
  try { await db.session.deleteMany({ where: { userId: req.user.id, id: { not: req.sessionId } } }); res.json({ ok: true }); } catch (error) { next(error); }
});
import { publicUser } from '../middleware/auth.js';

router.put('/profile', async (req, res, next) => {
  try {
    const name = String(req.body.name ?? '').trim();
    if (name.length < 2) return res.status(400).json({ error: 'Enter a name with at least 2 characters.' });
    const user = await db.user.update({ where: { id: req.user.id }, data: { name: name.slice(0, 80) } });
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

router.post('/password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 1024) return res.status(400).json({ error: 'Provide your current password and a new password of at least 8 characters.' });
    if (!(await verifyPassword(currentPassword, req.user.password))) return res.status(401).json({ error: 'Your current password is incorrect.' });
    await db.$transaction([
      db.user.update({ where: { id: req.user.id }, data: { password: await hashPassword(newPassword) } }),
      db.session.deleteMany({ where: { userId: req.user.id, id: { not: req.sessionId } } }),
      db.passwordRecovery.deleteMany({ where: { userId: req.user.id } })
    ]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

export default router;
