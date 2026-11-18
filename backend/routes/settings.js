import { withWorkspaceLock } from '../services/workspace-lock.js';
import { Router } from 'express';
import { publicSettings, settingsUpdate } from '../services/privacy.js';
import { db } from '../storage/db.js';
import { hashPassword, verifyPassword } from '../utils/crypto.js';
import { publicUser } from '../middleware/auth.js';
import { rebuildContextAssignments } from '../engine/rebuild.js';

const router = Router();

// GET / - get settings
router.get('/', async (req, res, next) => {
  try {
    const workspace = await db.workspace.findUnique({ where: { id: req.workspaceId } });
    return res.status(200).json(publicSettings(workspace.settings || {}));
  } catch (error) {
    next(error);
  }
});

// PUT / - update settings
router.put('/', async (req, res, next) => {
  try {
    const newSettings = await withWorkspaceLock(db, req.workspaceId, async tx => {
      const workspace = await tx.workspace.findUnique({ where: { id: req.workspaceId } });
      const settings = settingsUpdate(workspace.settings || {}, req.body);
      await tx.workspace.update({ where: { id: req.workspaceId }, data: { settings } });
      for (const [source, connected] of Object.entries(req.body.apps || {})) {
        if (typeof connected === 'boolean') await tx.connector.updateMany({ where: { workspaceId: req.workspaceId, source }, data: { connected } });
      }
      return settings;
    });

    return res.status(200).json(publicSettings(newSettings));
  } catch (error) {
    next(error);
  }
});

// PUT /account/profile - update user name
router.put('/account/profile', async (req, res, next) => {
  try {
    const { user } = req;
    const data = req.body;
    
    const name = String(data.name ?? '').trim();
    if (name.length < 2) return res.status(400).json({ error: 'Enter a name with at least 2 characters.' });
    
    const updated = await db.user.update({ where: { id: user.id }, data: { name: name.slice(0, 80) } });
    return res.status(200).json({ user: publicUser(updated) });
  } catch (error) {
    next(error);
  }
});

// POST /account/password - change password
router.post('/account/password', async (req, res, next) => {
  try {
    const { user } = req;
    const data = req.body;
    
    if (typeof data.currentPassword !== 'string' || typeof data.newPassword !== 'string' || data.newPassword.length < 8 || data.newPassword.length > 1024) {
      return res.status(400).json({ error: 'Provide your current password and a new password of at least 8 characters.' });
    }
    
    if (!(await verifyPassword(data.currentPassword, user.password))) {
      return res.status(401).json({ error: 'Your current password is incorrect.' });
    }
    
    const newPasswordHash = await hashPassword(data.newPassword);
    
    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { password: newPasswordHash } }),
      db.session.deleteMany({ where: { userId: user.id, id: { not: req.sessionId } } }),
      db.passwordRecovery.deleteMany({ where: { userId: user.id } })
    ]);
    
    return res.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// POST /context-engine/rebuild - rebuild context assignments
router.post('/context-engine/rebuild', async (req, res, next) => {
  try {
    const result = await rebuildContextAssignments(req.workspaceId);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
