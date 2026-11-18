import { createHash } from 'node:crypto';
import { db } from '../storage/db.js';
import { id } from '../utils/id.js';
import { sourceNames } from '../utils/format.js';
import { correlationEvidence, retrieveCandidates } from './correlate.js';
import { stateFrom } from './state.js';
import { extractEntities } from './extract.js';
import { generateEmbedding } from './embed.js';
import { evaluateContextMatch } from './ai.js';
import { extractEntitiesLocal } from './local.js';
import { matchDecision, normalizeJudgment } from '../services/matching.js';
import { collectionDecision, normalizeActivity, privacyFor } from '../services/privacy.js';

export async function activityFromStored(workspaceId, stored) {
  const linked = stored.entityId ? await db.entity.findFirst({ where: { id: stored.entityId, workspaceId } }) : null;
  return { source: stored.source, type: stored.type, title: stored.title, detail: stored.detail || '', project: linked?.metadata?.project || '', entity: linked?.label || stored.title, entityType: linked?.type || 'activity', kind: stored.kind, href: linked?.href || '' };
}

export function activityFingerprint(workspaceId, activity) {
  return createHash('sha256').update(JSON.stringify(activity.externalId ? [workspaceId, activity.source, activity.externalId] : [workspaceId, activity.source, activity.title, activity.detail, activity.href, activity.project])).digest('hex');
}

// Dependency injection keeps regression tests offline and leaves database transactions short.
export function createIngest({ database = db, extract = extractEntities, embed = generateEmbedding, judge = evaluateContextMatch, beforePersist = null, capturedAt = null } = {}) {
  return async function ingestActivity(workspaceId, input) {
    const workspace = await database.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) throw Object.assign(new Error('Workspace not found.'), { status: 404 });
    const settings = workspace.settings || {};
    const activity = normalizeActivity(input, settings);
    const policy = collectionDecision(settings, activity);
    if (!policy.allowed) return { ignored: true, reason: policy.reason };
    let hostname = '';
    try { hostname = new URL(activity.href).hostname; } catch { /* File metadata has no URL. */ }
    if (activity.source === 'chrome' && (/^contexa(?:$| [\/—-])/i.test(activity.title) || activity.title.toLowerCase().includes('workspace memory') || ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(hostname) || /(^|\.)contexa\.(app|ai|dev)$/.test(hostname))) return { ignored: true, reason: 'self_traffic' };
    if (/^(new tab|about:blank|untitled|null)$/i.test(activity.title) || /^chrome:\/\//i.test(activity.title)) return { ignored: true, reason: 'noise' };

    const recordedAt = capturedAt ? new Date(capturedAt) : new Date();
    const fingerprint = activityFingerprint(workspaceId, activity);
    const duplicateWhere = { workspaceId, entity: { metadata: { path: ['fingerprint'], equals: fingerprint } }, ...(activity.externalId ? {} : { createdAt: { gte: new Date(recordedAt.getTime() - 60000), lte: new Date(recordedAt.getTime() + 60000) } }) };
    if (await database.event.findFirst({ where: duplicateWhere })) return { ignored: true, reason: 'duplicate' };
    const diagnostic = activity.type === 'test_signal_ping';
    if (diagnostic) activity.kind = 'DIAGNOSTIC';
    const allowCloud = !diagnostic && privacyFor(settings).cloudAI;
    const deadline = Date.now() + 20000;
    let judgeCalls = 0;
    const boundedJudge = async (context, activity) => {
      if (judgeCalls++ >= 4 || Date.now() >= deadline - 1000) return { status: 'AI_UNAVAILABLE' };
      return judge(context, activity, { allowCloud, deadline });
    };
    const local = extractEntitiesLocal(activity);
    const [extracted, embedding] = await Promise.all([
      allowCloud ? extract(activity, { allowCloud }) : {},
      embed(`${activity.title} ${activity.detail} ${local.topic || ''}`, { allowCloud })
    ]);
    const entities = { ...local, ...extracted, project: activity.source === 'chrome' ? extracted.project || null : activity.project || extracted.project || local.project, keywords: local.keywords };
    const contexts = diagnostic ? [] : await database.context.findMany({ where: { workspaceId, state: { not: 'ARCHIVED' } } });
    const candidates = retrieveCandidates(contexts, activity, entities, embedding).map(({ item }) => ({ item, evidence: correlationEvidence(item, activity, entities, embedding) })).sort((a, b) => b.evidence.score - a.evidence.score);
    let chosen = null, uncertain = null, rejected = null;
    for (const candidate of candidates.slice(0, 3)) {
      const judgment = candidate.evidence.isHighConfidence ? null : normalizeJudgment(await boundedJudge(candidate.item, activity));
      const decision = matchDecision(candidate.evidence, judgment);
      const evidence = { ...candidate.evidence, evidence: [...candidate.evidence.evidence, ...(judgment && judgment.status !== 'AI_UNAVAILABLE' ? [{ signal: 'ai_judge', description: judgment.reason.join(' · ') || judgment.status, score: 0 }] : [])] };
      if (decision === 'MERGE') { chosen = { ...candidate, evidence }; break; }
      if (decision === 'SEPARATE' && !rejected) rejected = { ...candidate, evidence };
      if (decision === 'UNCERTAIN' && !uncertain) uncertain = { ...candidate, evidence };
    }
    // Unassigned signals only create a context when there is substantive overlap.
    let cluster = null;
    if (!diagnostic && !chosen && !uncertain) {
      const previous = await database.event.findMany({ where: { workspaceId, contextId: null, type: { not: 'dismissed' }, kind: { not: 'DIAGNOSTIC' } }, include: { entity: true }, orderBy: { createdAt: 'desc' }, take: 20 });
      for (const event of previous) {
        if (event.entity?.metadata?.explanation?.method === 'manual') continue;
        const temp = { name: event.title, topic: event.title, description: '', updatedAt: event.createdAt, embedding: event.embedding };
        const evidence = correlationEvidence(temp, activity, entities, embedding);
        if (evidence.isHighConfidence && evidence.evidence.some(x => ['keyword_match', 'project_match', 'issue_match', 'file_match', 'semantic_match'].includes(x.signal))) { cluster = { event, evidence }; break; }
        if (evidence.isMediumConfidence && matchDecision(evidence, await boundedJudge(temp, activity)) === 'MERGE') { cluster = { event, evidence }; break; }
      }
    }

    return database.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
      // Deleting captured data also deletes queued jobs; a canceled worker cannot recreate it.
      if (beforePersist && !await beforePersist(tx)) return { ignored: true, reason: 'delivery_cancelled' };
      // Recheck after the lock so simultaneous delivery cannot create duplicates.
      if (await tx.event.findFirst({ where: duplicateWhere })) return { ignored: true, reason: 'duplicate' };
      const latest = await tx.workspace.findUnique({ where: { id: workspaceId } });
      const latestSettings = latest?.settings || {};
      const latestPolicy = collectionDecision(latestSettings, activity);
      if (!latestPolicy.allowed) return { ignored: true, reason: latestPolicy.reason };
      // A pause or privacy change during an AI call must take effect before persistence.
      if (JSON.stringify(privacyFor(latestSettings)) !== JSON.stringify(privacyFor(settings))) return { ignored: true, reason: 'privacy_changed_retry' };
      let context = chosen ? await tx.context.findFirst({ where: { id: chosen.item.id, workspaceId } }) : null;
      let evidence = chosen?.evidence || uncertain?.evidence || rejected?.evidence || { score: 0, evidence: [{ signal: 'isolated', description: diagnostic ? 'Diagnostic ping; excluded from work contexts and analytics.' : 'No existing context had enough evidence. Review this isolated activity in your inbox.', score: 0 }] };
      let created = false;
      const prior = cluster ? await tx.event.findFirst({ where: { id: cluster.event.id, workspaceId, contextId: null, type: { not: 'dismissed' } }, include: { entity: true } }) : null;
      if (!context && prior?.entityId && prior.entity?.metadata?.explanation?.method !== 'manual') {
        const name = entities.searchQuery || entities.project || entities.topic || activity.title;
        context = await tx.context.create({ data: { id: id('context'), workspaceId, name: name.slice(0, 60), topic: (entities.topic || activity.title).slice(0, 100), description: `Related ${sourceNames[activity.source]} activity.`, state: stateFrom(activity), confidence: cluster.evidence.score, sources: [...new Set([activity.source, prior.source])], tint: 'violet', embedding } });
        await tx.event.update({ where: { id: prior.id }, data: { contextId: context.id } });
        await tx.entity.updateMany({ where: { id: prior.entityId, workspaceId }, data: { contextId: context.id, metadata: { ...prior.entity?.metadata, explanation: { outcome: 'MERGE', method: 'hybrid-v2', score: cluster.evidence.score, reasons: ['Grouped with a related subsequent activity.', ...cluster.evidence.evidence.map(x => x.description)], contextId: context.id } } } });
        evidence = cluster.evidence;
        created = true;
      }
      const explanation = { outcome: context ? 'MERGE' : uncertain ? 'UNCERTAIN' : 'SEPARATE', score: evidence.score, reasons: evidence.evidence.map(x => x.description), contextId: context?.id || uncertain?.item.id || null, method: 'hybrid-v2' };
      const entity = await tx.entity.create({ data: { id: id('entity'), workspaceId, contextId: context?.id || null, source: activity.source, type: activity.entityType, label: activity.entity, href: activity.href, createdAt: recordedAt, metadata: { project: entities.project || '', topic: entities.topic || '', issue: entities.issue || '', file: entities.file || '', fingerprint, explanation } } });
      const event = await tx.event.create({ data: { id: id('event'), workspaceId, contextId: context?.id || null, source: activity.source, type: activity.type, kind: activity.kind, title: activity.title, detail: activity.detail, entityId: entity.id, embedding, createdAt: recordedAt } });
      if (context) {
        const neighbors = await tx.entity.findMany({ where: { workspaceId, contextId: context.id, id: { not: entity.id } }, take: 3, orderBy: { createdAt: 'desc' } });
        for (const neighbor of neighbors) await tx.relationship.create({ data: { id: id('relationship'), contextId: context.id, fromEntity: neighbor.id, toEntity: entity.id, type: 'related_to', reason: explanation.reasons.join(' | ') || 'Related work activity', confidence: evidence.score } });
        context = await tx.context.update({ where: { id: context.id }, data: { sources: [...new Set([...context.sources, activity.source])], state: stateFrom(activity), confidence: evidence.score, updatedAt: new Date() } });
      }
      await tx.connector.updateMany({ where: { workspaceId, source: activity.source }, data: { lastSyncAt: new Date() } });
      return { context, event, entity, matched: explanation.outcome, created, score: evidence.score, explanation };
    }, { timeout: 15000 });
  };
}
export const ingest = createIngest();
