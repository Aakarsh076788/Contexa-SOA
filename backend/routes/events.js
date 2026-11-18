import { Router } from 'express';
import { db } from '../storage/db.js';
import { listEvents } from '../services/event-query.js';
import { reviewEvent } from '../services/events.js';
const router = Router();
router.get('/', async (req, res, next) => {
  try {
    res.json(await listEvents(db, req.workspaceId, req.query));
  } catch (error) { next(error); }
});
router.patch('/:eventId', async (req, res, next) => {
  try { res.json(await reviewEvent(db, req.workspaceId, req.params.eventId, req.body)); } catch (error) { next(error); }
});
export default router;
