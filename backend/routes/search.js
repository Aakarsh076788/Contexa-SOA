import { Router } from 'express';
import { db } from '../storage/db.js';
import { presentContext, presentEvent } from '../storage/workspace.js';
const router = Router();
router.get('/', async (req, res, next) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
    if (!query) return res.json({ contexts: [], entities: [], events: [] });
    const contains = { contains: query, mode: 'insensitive' };
    const base = { workspaceId: req.workspaceId };
    const [contexts, entities, events] = await Promise.all([
      db.context.findMany({ where: { ...base, OR: [{ name: contains }, { topic: contains }, { sessionNote: contains }] }, take: 20, orderBy: { updatedAt: 'desc' } }),
      db.entity.findMany({ where: { ...base, label: contains }, take: 12, orderBy: { createdAt: 'desc' } }),
      db.event.findMany({ where: { ...base, OR: [{ title: contains }, { detail: contains }] }, take: 12, orderBy: { createdAt: 'desc' } })
    ]);
    res.json({ contexts: contexts.map(x => presentContext(x)), entities: entities.map(({ metadata, ...safe }) => safe), events: events.map(presentEvent) });
  } catch (error) { next(error); }
});
export default router;
