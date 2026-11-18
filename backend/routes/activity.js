import { Router } from 'express';
import { db } from '../storage/db.js';
import { recordDeliveryError } from '../services/diagnostics.js';
import { enqueueActivity } from '../services/ingestion-queue.js';
import { ingest } from '../engine/ingest.js';
import { sessionAuth, connectorAuth } from '../middleware/auth.js';
const router = Router();
async function capture(req, res, next) {
  try {
    const result = await ingest(req.workspaceId, req.body);
    res.status(result.ignored ? 200 : 201).json(result);
  } catch (error) { await recordDeliveryError(db, req.workspaceId, req.body?.source, error); next(error); }
}
router.post('/connector-activity', connectorAuth, async (req, res, next) => {
  try {
    const result = await enqueueActivity(db, req.workspaceId, req.body);
    res.status(result.ignored ? 200 : 202).json(result);
  } catch (error) { await recordDeliveryError(db, req.workspaceId, req.body?.source, error); next(error); }
});
router.get('/capture-status/:jobId', sessionAuth, async (req, res, next) => {
  try {
    const job = await db.ingestionJob.findFirst({ where: { id: req.params.jobId, workspaceId: req.workspaceId }, select: { id: true, status: true, attempts: true, result: true, lastError: true, createdAt: true, updatedAt: true } });
    if (!job) return res.status(404).json({ error: 'Delivery not found.' });
    res.json(job);
  } catch (error) { next(error); }
});
router.post('/activity', sessionAuth, capture);
export default router;
