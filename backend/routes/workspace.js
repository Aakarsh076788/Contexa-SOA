import { Router } from 'express';
import { listEvents } from '../services/event-query.js';
import { workspaceInsights } from '../services/insights.js';
import { contextDetail } from '../engine/helpers.js';
import { publicSettings } from '../services/privacy.js';
import { db } from '../storage/db.js';
import { publicUser } from '../middleware/auth.js';
import { presentContext, presentEvent, settingsFor, sourceName } from '../storage/workspace.js';

const router = Router();

// GET / - get full workspace data (user + workspace)
router.get('/', async (req, res, next) => {
  try {
    const { user, workspaceId } = req;
    
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        connectors: true,
        contexts: { orderBy: { updatedAt: 'desc' }, include: { _count: { select: { events: true } } } }
      }
    });
    const [page, inboxCount] = await Promise.all([
      listEvents(db, workspaceId, { limit: '100', includeDismissed: 'true' }),
      db.event.count({ where: { workspaceId, contextId: null, type: { not: 'dismissed' }, kind: { not: 'DIAGNOSTIC' } } })
    ]);
    const contexts = workspace.contexts.map(item => presentContext(item));
    return res.status(200).json({ user: publicUser(user), id: workspace.id, settings: publicSettings(settingsFor(workspace.settings)), connectors: workspace.connectors.map((item) => ({ ...item, name: sourceName(item.source) })), contexts, events: page.events, counts: { events: page.total, inbox: inboxCount, contexts: contexts.length }, eventPage: { nextCursor: page.nextCursor, total: page.total } });
  } catch (error) {
    next(error);
  }
});

router.get('/insights', async (req, res, next) => {
  try { res.json(await workspaceInsights(db, req.workspaceId, req.query)); } catch (error) { next(error); }
});

router.get('/export', async (req, res, next) => {
  try {
    const contexts = await db.context.findMany({ where: { workspaceId: req.workspaceId }, orderBy: { updatedAt: 'desc' } });
    const packages = [];
    for (const context of contexts) packages.push({ schema: 'contexa-context-package/v1', context: await contextDetail(req.workspaceId, context) });
    const unassigned = await db.event.findMany({ where: { workspaceId: req.workspaceId, contextId: null }, include: { entity: true }, orderBy: { createdAt: 'desc' } });
    res.json({ schema: 'contexa-workspace-export/v1', exportedAt: new Date().toISOString(), packages, unassigned: unassigned.map(presentEvent) });
  } catch (error) { next(error); }
});
router.delete('/activity', async (req, res, next) => {
  try {
    const workspaceId = req.workspaceId;
    await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
      await tx.ingestionJob.deleteMany({ where: { workspaceId } });
      await tx.event.deleteMany({ where: { workspaceId } });
      await tx.entity.deleteMany({ where: { workspaceId } });
      await tx.context.deleteMany({ where: { workspaceId } });
    });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

export default router;
