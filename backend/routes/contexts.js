import { Router } from 'express';
import { createCheckpoint, createBranch } from '../services/checkpoints.js';
import { deleteContexts, mergeContexts, importContext, states } from '../services/contexts.js';
import { privacyFor } from '../services/privacy.js';
import { db } from '../storage/db.js';
import { id } from '../utils/id.js';
import { presentContext } from '../storage/workspace.js';
import { getContext, getEvents, contextDetail, diff } from '../engine/helpers.js';
import { mergeContextBranches } from '../engine/merge.js';
import { generateAiSummary } from '../engine/ai.js';
import { synthesizePrompt } from '../engine/prompt.js';

const router = Router();

// GET / - list all contexts with eventCount
router.get('/', async (req, res, next) => {
  try {
    const { workspaceId } = req;
    const contexts = await db.context.findMany({ where: { workspaceId }, orderBy: { updatedAt: 'desc' }, include: { _count: { select: { events: true } } } });
    return res.status(200).json(contexts.map(item => presentContext(item)));
  } catch (error) {
    next(error);
  }
});

// POST / - create a new context
router.post('/', async (req, res, next) => {
  try {
    const { workspaceId } = req;
    const data = req.body;
    
    if (!data.name?.trim()) {
      return res.status(400).json({ error: 'A context name is required.' });
    }
    
    const contextId = id('context');
    const item = await db.context.create({
      data: {
        id: contextId,
        workspaceId,
        name: data.name.trim().slice(0, 60),
        topic: String(data.topic ?? 'New work').trim().slice(0, 100),
        tint: 'violet',
        description: String(data.description ?? 'Created manually.').slice(0, 500),
        state: 'DISCOVERY',
        confidence: 0,
        embedding: [],
        sources: [],
        sessionNote: '',
        nextAction: 'Review the related work and choose the next action.'
      }
    });
    
    return res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

// Handoffs and mutations are atomic and scoped to this workspace.
router.post('/import', async (req, res, next) => {
  try { res.status(201).json(await importContext(db, req.workspaceId, req.body.package)); } catch (error) { next(error); }
});
router.post('/merge', async (req, res, next) => {
  try { res.json(await mergeContexts(db, req.workspaceId, req.body.contextIds)); } catch (error) { next(error); }
});
router.post('/batch-delete', async (req, res, next) => {
  try { res.json(await deleteContexts(db, req.workspaceId, req.body.contextIds)); } catch (error) { next(error); }
});

// Middleware for parameter validation
router.param('contextId', async (req, res, next, contextId) => {
  try {
    const { workspaceId } = req;
    const item = await getContext(workspaceId, contextId);
    if (!item) {
      return res.status(404).json({ error: 'Context not found.' });
    }
    req.item = item;
    next();
  } catch (error) {
    next(error);
  }
});

// GET /:contextId - get context detail
router.get('/:contextId', async (req, res, next) => {
  try {
    const { workspaceId, item } = req;
    return res.status(200).json(await contextDetail(workspaceId, item));
  } catch (error) {
    next(error);
  }
});

// PUT /:contextId - update context state/nextAction
router.put('/:contextId', async (req, res, next) => {
  try {
    const { item } = req;
    const data = req.body;
    
    const updateData = {};
    if (data.state && !states.includes(data.state)) return res.status(400).json({ error: 'Choose a supported context state.' });
    if (data.state) updateData.state = data.state;
    if (typeof data.name === 'string' && data.name.trim()) updateData.name = data.name.trim().slice(0, 80);
    if (typeof data.description === 'string') updateData.description = data.description.slice(0, 500);
    if (data.nextAction) updateData.nextAction = String(data.nextAction).slice(0, 300);
    
    if (Object.keys(updateData).length > 0) {
      const updated = await db.context.update({
        where: { id: item.id },
        data: updateData
      });
      return res.status(200).json(updated);
    }
    
    return res.status(200).json(item);
  } catch (error) {
    next(error);
  }
});

// DELETE /:contextId - release captured activity, keeping the timeline intact.
router.delete('/:contextId', async (req, res, next) => {
  try { res.json({ deleted: req.params.contextId, ...await deleteContexts(db, req.workspaceId, [req.params.contextId]) }); } catch (error) { next(error); }
});

// GET /:contextId/graph - get context graph nodes and edges
router.get('/:contextId/graph', async (req, res, next) => {
  try {
    const { item } = req;
    const { contextId } = req.params;
    
    const nodes = await db.entity.findMany({ where: { contextId } });
    const relationships = await db.relationship.findMany({ where: { contextId } });
    return res.status(200).json({
      context: item,
      nodes,
      edges: relationships.map((item) => ({ ...item, from: item.fromEntity, to: item.toEntity }))
    });
  } catch (error) {
    next(error);
  }
});

// GET /:contextId/related - get related entities through the graph
router.get('/:contextId/related', async (req, res, next) => {
  try {
    const { contextId } = req.params;
    const entityId = req.query.entity;
    
    if (!entityId) return res.status(400).json({ error: 'Entity ID is required.' });
    
    const edges = await db.relationship.findMany({ where: { contextId, OR: [{ fromEntity: entityId }, { toEntity: entityId }] } });
    const ids = [...new Set(edges.flatMap(x => [x.fromEntity, x.toEntity]))].filter(x => x !== entityId);
    return res.json(await db.entity.findMany({ where: { workspaceId: req.workspaceId, contextId, id: { in: ids } } }));
  } catch (error) {
    next(error);
  }
});

// GET /:contextId/timeline - get context events
router.get('/:contextId/timeline', async (req, res, next) => {
  try {
    const { workspaceId } = req;
    const { contextId } = req.params;
    return res.status(200).json(await getEvents(workspaceId, contextId));
  } catch (error) {
    next(error);
  }
});

// GET /:contextId/versions - get context versions
router.get('/:contextId/versions', async (req, res, next) => {
  try {
    const { contextId } = req.params;
    const versions = await db.version.findMany({ 
      where: { contextId },
      orderBy: { number: 'desc' }
    });
    return res.status(200).json(versions);
  } catch (error) {
    next(error);
  }
});

router.post('/:contextId/versions', async (req, res, next) => {
  try { res.status(201).json(await createCheckpoint(db, req.workspaceId, req.params.contextId, req.body)); } catch (error) { next(error); }
});

// GET /:contextId/branches - get context branches
router.get('/:contextId/branches', async (req, res, next) => {
  try {
    const { contextId } = req.params;
    const branches = await db.branch.findMany({ where: { contextId } });
    return res.status(200).json(branches);
  } catch (error) {
    next(error);
  }
});

router.post('/:contextId/branches', async (req, res, next) => {
  try { res.status(201).json(await createBranch(db, req.workspaceId, req.params.contextId, req.body)); } catch (error) { next(error); }
});

// GET /:contextId/diff - diff two versions
router.get('/:contextId/diff', async (req, res, next) => {
  try {
    const { workspaceId } = req;
    const { contextId } = req.params;
    
    const result = await diff(workspaceId, contextId, req.query.from, req.query.to);
    return result ? res.status(200).json(result) : res.status(400).json({ error: 'Choose two valid context versions.' });
  } catch (error) {
    next(error);
  }
});

// PUT /:contextId/note - update session note
router.put('/:contextId/note', async (req, res, next) => {
  try {
    const { item } = req;
    const data = req.body;
    const updated = await db.context.update({ where: { id: item.id }, data: { sessionNote: String(data.note ?? '').slice(0, 2000), ...(typeof data.nextAction === 'string' ? { nextAction: data.nextAction.slice(0, 300) } : {}) } });
    return res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
});

// POST /:contextId/summarize - generate AI summary
router.post('/:contextId/summarize', async (req, res, next) => {
  try {
    const { workspaceId, item } = req;
    const { contextId } = req.params;
    
    const events = await getEvents(workspaceId, contextId);
    const workspace = await db.workspace.findUnique({ where: { id: workspaceId } });
    const summary = await generateAiSummary(item, events, { allowCloud: privacyFor(workspace.settings || {}).cloudAI });
    
    return res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
});

// POST /:contextId/generate-prompt or POST /:contextId/synthesize-prompt
router.post('/:contextId/generate-prompt', async (req, res, next) => {
  try {
    const { workspaceId, item } = req;
    const { contextId } = req.params;
    const { templateType = 'continue' } = req.body || {};
    
    const events = await getEvents(workspaceId, contextId);
    const entities = await db.entity.findMany({ where: { contextId } });
    const relationships = await db.relationship.findMany({ where: { contextId } });
    const versions = await db.version.findMany({ where: { contextId }, orderBy: { number: 'desc' } });
    
    if (templateType === 'continue' || templateType === 'debug' || templateType === 'review') {
      const synthesized = synthesizePrompt(item, { entities, events, templateType });
      return res.status(200).json({
        ...synthesized,
        stats: { events: events.length, entities: entities.length, relationships: relationships.length, sources: [...new Set(events.map(e => e.source))].length }
      });
    }

    // Comprehensive format
    const lines = [];
    lines.push(`# Context: ${item.name}`);
    lines.push(`## Topic: ${item.topic}`);
    lines.push(`## Current State: ${item.state}`);
    lines.push(`## Confidence: ${item.confidence}%`);
    if (item.description) lines.push(`## Description: ${item.description}`);
    if (item.sessionNote) lines.push(`## Session Note: ${item.sessionNote}`);
    if (item.nextAction) lines.push(`## Next Action: ${item.nextAction}`);
    lines.push('');
    
    const sources = [...new Set(events.map(e => e.source))];
    lines.push(`## Connected Sources: ${sources.join(', ') || 'None'}`);
    lines.push('');
    
    lines.push('## Activity Timeline');
    lines.push('The user performed the following activities in chronological order:');
    lines.push('');
    
    const chronological = events.slice().reverse();
    for (let i = 0; i < chronological.length; i++) {
      const e = chronological[i];
      const time = e.day ? `${e.day}, ${e.time}` : (e.createdAt || '');
      lines.push(`${i + 1}. [${e.source.toUpperCase()}] ${e.title}${e.detail ? ` — ${e.detail}` : ''}${time ? ` (${time})` : ''}`);
    }
    lines.push('');
    
    lines.push('## Entities (Resources the user interacted with)');
    lines.push('');
    for (const ent of entities) {
      const meta = ent.metadata || {};
      let desc = `- **${ent.label}** [${ent.type}] from ${ent.source}`;
      if (ent.href) desc += ` — URL: ${ent.href}`;
      if (meta.file) desc += ` | File: ${meta.file}`;
      lines.push(desc);
    }
    lines.push('');
    
    lines.push('---');
    lines.push('## Instructions for Receiving LLM');
    lines.push('The above is an automatically synthesized snapshot of a user\'s cross-application work context from Contexa. Respond with full awareness of their work, recent files, and research progress.');
    
    const prompt = lines.join('\n');
    return res.status(200).json({ prompt, templateType: 'comprehensive', stats: { events: events.length, entities: entities.length, relationships: relationships.length, sources: sources.length } });
  } catch (error) {
    next(error);
  }
});

// Alias for synthesize-prompt
router.post('/:contextId/synthesize-prompt', async (req, res, next) => {
  req.url = `/${req.params.contextId}/generate-prompt`;
  return router.handle(req, res, next);
});

// POST /:contextId/restore - prepare restore plan
router.post('/:contextId/restore', async (req, res, next) => {
  try {
    const { contextId } = req.params;
    const { versionNumber } = req.body || {};
    if (!Number.isSafeInteger(Number(versionNumber)) || Number(versionNumber) < 1) return res.status(400).json({ error: 'Create a checkpoint, then choose its version to restore.' });
    
    const record = await db.version.findFirst({
      where: { contextId, number: Number(versionNumber) }
    });
    
    if (!record) return res.status(404).json({ error: 'Version not found.' });
    
    const restorePlan = [];
    for (const entityId of record.entityIds) {
      const entry = await db.entity.findFirst({ where: { id: entityId, workspaceId: req.workspaceId, contextId } });
      if (entry) {
        restorePlan.push({
          source: entry.source,
          label: entry.label,
          href: entry.href,
          automatic: Boolean(entry.href),
          message: entry.href ? 'Ready to open when you confirm.' : 'Open through the connected application when supported.'
        });
      }
    }
      
    return res.status(200).json({ version: record, restorePlan });
  } catch (error) {
    next(error);
  }
});

// POST /:contextId/handoff - create handoff package
router.post('/:contextId/handoff', async (req, res, next) => {
  try {
    const { workspaceId, item } = req;
    const { contextId } = req.params;
    const data = req.body;
    
    const handoff = {
      id: id('handoff'),
      contextId,
      recipient: String(data.recipient ?? 'Teammate').slice(0, 100),
      note: String(data.note ?? '').slice(0, 2000),
      createdAt: new Date().toISOString(),
      package: {
        schema: 'contexa-context-package/v1',
        context: await contextDetail(workspaceId, item)
      }
    };
    
    return res.status(201).json(handoff);
  } catch (error) {
    next(error);
  }
});

// POST /:contextId/branches/:branchId/merge - merge branch
router.post('/:contextId/branches/:branchId/merge', async (req, res, next) => {
  try {
    const { workspaceId } = req;
    const { contextId, branchId } = req.params;
    
    const mergedVersion = await mergeContextBranches(workspaceId, contextId, branchId);
    
    return res.status(201).json(mergedVersion);
  } catch (error) {
    next(error);
  }
});

export default router;
