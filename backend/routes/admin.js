import { Router } from 'express';
import { db } from '../storage/db.js';

const router = Router();

// GET /stats — Dashboard stats (counts only, NO user content data)
router.get('/stats', async (req, res, next) => {
  try {
    const [totalUsers, totalWorkspaces, totalContexts, totalEvents, totalEntities, totalConnectors, totalSessions] = await Promise.all([
      db.user.count(),
      db.workspace.count(),
      db.context.count(),
      db.event.count(),
      db.entity.count(),
      db.connector.count(),
      db.session.count()
    ]);

    // Active users = users with sessions in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeUsers = await db.session.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { userId: true },
      distinct: ['userId']
    });

    // Events today
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const eventsToday = await db.event.count({ where: { createdAt: { gte: todayStart } } });

    // Events this week
    const eventsThisWeek = await db.event.count({ where: { createdAt: { gte: sevenDaysAgo } } });

    // Connectors by source
    const connectors = await db.connector.findMany({ select: { source: true, connected: true } });
    const connectorsBySource = {};
    const connectedBySource = {};
    for (const c of connectors) {
      connectorsBySource[c.source] = (connectorsBySource[c.source] || 0) + 1;
      if (c.connected) connectedBySource[c.source] = (connectedBySource[c.source] || 0) + 1;
    }

    res.json({
      totalUsers,
      totalWorkspaces,
      totalContexts,
      totalEvents,
      totalEntities,
      totalConnectors,
      totalSessions,
      activeUsers: activeUsers.length,
      eventsToday,
      eventsThisWeek,
      connectorsBySource,
      connectedBySource
    });
  } catch (error) { next(error); }
});

// GET /users — List users (management info only, no content)
router.get('/users', async (req, res, next) => {
  try {
    const users = await db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        workspace: {
          select: {
            id: true,
            _count: { select: { contexts: true, connectors: true } }
          }
        },
        _count: { select: { sessions: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // For each user, get event count from their workspace
    const result = await Promise.all(users.map(async (u) => {
      let eventCount = 0;
      if (u.workspace) {
        eventCount = await db.event.count({ where: { workspaceId: u.workspace.id } });
      }
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        activeSessions: u._count.sessions,
        workspace: u.workspace ? {
          id: u.workspace.id,
          contextCount: u.workspace._count.contexts,
          connectorCount: u.workspace._count.connectors,
          eventCount
        } : null
      };
    }));

    res.json(result);
  } catch (error) { next(error); }
});

// PUT /users/:userId/role — Update user role
router.put('/users/:userId/role', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Role must be "user" or "admin".' });
    }
    const target = await db.user.findUnique({ where: { id: userId } });
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.email === 'chimmaniaakarsh7@gmail.com' && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot demote the primary administrator.' });
    }
    const user = await db.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, name: true, email: true, role: true }
    });
    res.json(user);
  } catch (error) { next(error); }
});

// DELETE /users/:userId — Delete user and all their data
router.delete('/users/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    // Don't allow self-deletion
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }
    const target = await db.user.findUnique({ where: { id: userId }, include: { workspace: true } });
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.email === 'chimmaniaakarsh7@gmail.com') {
      return res.status(400).json({ error: 'Cannot delete the primary administrator.' });
    }

    await db.$transaction(async tx => {
      if (target.workspace) {
        const wId = target.workspace.id;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${wId}))`;
        await tx.relationship.deleteMany({ where: { context: { workspaceId: wId } } });
        await tx.version.deleteMany({ where: { context: { workspaceId: wId } } });
        await tx.branch.deleteMany({ where: { context: { workspaceId: wId } } });
        await tx.event.deleteMany({ where: { workspaceId: wId } });
        await tx.entity.deleteMany({ where: { workspaceId: wId } });
        await tx.context.deleteMany({ where: { workspaceId: wId } });
        await tx.connector.deleteMany({ where: { workspaceId: wId } });
        await tx.workspace.delete({ where: { id: wId } });
      }
      await tx.session.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });
    res.json({ ok: true, deleted: userId });
  } catch (error) { next(error); }
});

// POST /users/:userId/reset-password — Reset user's password
router.post('/users/:userId/reset-password', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { password } = req.body;
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    const { hashPassword } = await import('../utils/crypto.js');
    await db.user.update({
      where: { id: userId },
      data: { password: await hashPassword(password) }
    });
    // Invalidate all sessions for this user
    await db.session.deleteMany({ where: { userId } });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// GET /connectors — All connectors across all workspaces
router.get('/connectors', async (req, res, next) => {
  try {
    const connectors = await db.connector.findMany({
      include: {
        workspace: {
          include: { user: { select: { name: true, email: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(connectors.map(c => ({
      id: c.id,
      source: c.source,
      transport: c.transport,
      connected: c.connected,
      scopes: c.scopes,
      lastSyncAt: c.lastSyncAt,
      createdAt: c.createdAt,
      user: c.workspace.user
    })));
  } catch (error) { next(error); }
});

// GET /health — System health check
router.get('/health', async (req, res, next) => {
  try {
    const start = Date.now();
    // Test DB connection
    await db.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - start;

    const lastEvent = await db.event.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } });

    res.json({
      status: 'healthy',
      database: { connected: true, latencyMs: dbLatency },
      lastActivity: lastEvent?.createdAt || null,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version
    });
  } catch (error) {
    res.json({
      status: 'degraded',
      database: { connected: false, error: error.message },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version
    });
  }
});

export default router;
