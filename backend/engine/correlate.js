import { cosineSimilarity } from './embed.js';
import { keywords, keywordSimilarity } from './local.js';

/**
 * Retrieves a ranked list of candidate contexts worth deep evaluation.
 * Uses OR-style signals to cast a wide net without making a final merge decision.
 */
export function retrieveCandidates(contexts, activity, entities, eventEmbedding) {
  const candidates = [];
  const activityKws = keywords(`${activity.title} ${activity.detail || ''}`);
  
  for (const context of contexts) {
    const contextText = `${context.name} ${context.topic} ${context.description || ''} ${context.sessionNote || ''}`;
    const contextTextLower = contextText.toLowerCase();
    const contextKws = keywords(`${context.name} ${context.topic}`);
    
    let isCandidate = false;
    let maxSignal = 0;
    const reasons = [];
    
    // 1. Semantic Similarity
    const hasRealEmbedding = eventEmbedding && context.embedding && 
      eventEmbedding.length > 0 && context.embedding.length > 0 &&
      eventEmbedding.some(v => v !== 0) && context.embedding.some(v => v !== 0);
      
    if (hasRealEmbedding) {
      const similarity = cosineSimilarity(eventEmbedding, context.embedding);
      if (similarity > 0.55) { // Semantic retrieval
        isCandidate = true;
        maxSignal = Math.max(maxSignal, similarity);
        reasons.push(`Semantic similarity: ${(similarity*100).toFixed(1)}%`);
      }
    }
    
    // 2. Keyword Similarity
    const kwSim = keywordSimilarity(activityKws, contextKws);
    if (kwSim >= 0.08) { // Keyword retrieval
      isCandidate = true;
      maxSignal = Math.max(maxSignal, kwSim);
      reasons.push(`Keyword overlap: ${(kwSim*100).toFixed(1)}%`);
    }
    
    // 3. Topic/Entity Relationship
    if (entities.project && contextTextLower.includes(entities.project.toLowerCase())) {
      isCandidate = true;
      maxSignal = Math.max(maxSignal, 0.8);
      reasons.push(`Project match: ${entities.project}`);
    }
    if (entities.topic && entities.topic.length > 2 && contextTextLower.includes(entities.topic.toLowerCase())) {
      isCandidate = true;
      maxSignal = Math.max(maxSignal, 0.7);
      reasons.push(`Topic match: ${entities.topic}`);
    }

    // Direct title/keyword inclusion
    const sharedSignificant = activityKws.filter(a => a.length >= 3 && contextKws.includes(a));
    if (sharedSignificant.length > 0) {
      isCandidate = true;
      maxSignal = Math.max(maxSignal, 0.65);
      reasons.push(`Shared topic keywords: ${sharedSignificant.join(', ')}`);
    }
    
    // 4. Recent-context Relationship
    const timeDiffHours = (new Date() - new Date(context.updatedAt)) / (1000 * 60 * 60);
    if (timeDiffHours < 0.5) { // Active in last 30 min
      isCandidate = true;
      maxSignal = Math.max(maxSignal, 0.4);
      reasons.push(`Recently active context`);
    }
    
    // 5. Source match (weak metadata)
    if (context.sources && context.sources.includes(activity.source)) {
      maxSignal += 0.05;
    }
    
    if (isCandidate) {
      candidates.push({ item: context, maxSignal, reasons });
    }
  }
  
  // Return Top-K candidates
  return candidates.sort((a, b) => b.maxSignal - a.maxSignal).slice(0, 5);
}

/**
 * Hybrid correlation engine. Works in two modes:
 * 1. LOCAL MODE (no API) — keyword overlap + fuzzy matching + temporal + topic anchors
 * 2. AI MODE (when available) — adds embeddings + LLM reranker on top
 */
export function correlationEvidence(context, activity, entities = {}, eventEmbedding) {
  const evidence = [];
  let score = 0;

  const contextText = `${context.name} ${context.topic} ${context.description || ''} ${context.sessionNote || ''}`;
  const contextTextLower = contextText.toLowerCase();
  const activityTitleLower = (activity.title || '').toLowerCase();
  
  // ─── 1. LOCAL KEYWORD MATCHING (works without AI) ───────────────
  const activityKws = keywords(`${activity.title} ${activity.detail || ''}`);
  const contextKws = keywords(`${context.name} ${context.topic}`);
  
  // Calculate keyword similarity
  const kwSim = keywordSimilarity(activityKws, contextKws);
  const shared = activityKws.filter(a => contextKws.some(b => a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, Math.min(a.length, b.length) - 1) === b.slice(0, Math.min(a.length, b.length) - 1))));

  if (kwSim >= 0.3 || shared.length >= 2) {
    const kwScore = Math.min(55, Math.round(kwSim * 70) + (shared.length * 8));
    score += kwScore;
    evidence.push({ signal: 'keyword_match', description: `Strong keyword overlap (${(kwSim*100).toFixed(0)}%): ${shared.slice(0, 4).join(', ')}`, score: kwScore });
  } else if (kwSim >= 0.1 || shared.length >= 1) {
    const kwScore = Math.min(35, Math.round(kwSim * 50) + (shared.length * 10));
    score += kwScore;
    evidence.push({ signal: 'keyword_match', description: `Shared keywords (${(kwSim*100).toFixed(0)}%): ${shared.slice(0, 3).join(', ')}`, score: kwScore });
  }

  // Direct Subject / Title containment (e.g. context "bmw car" and page "BMW M5 Price...")
  if (context.name && context.name.length > 2 && (activityTitleLower.includes(context.name.toLowerCase()) || contextTextLower.includes(activityTitleLower))) {
    score += 40;
    evidence.push({ signal: 'topic_match', description: `Direct topic containment: "${context.name}"`, score: 40 });
  }

  // ─── 2. ENTITY MATCHING (from AI extraction, when available) ────
  if (entities.project && contextTextLower.includes(entities.project.toLowerCase())) {
    score += 30;
    evidence.push({ signal: 'project_match', description: `Matched project: ${entities.project}`, score: 30 });
  }
  
  if (entities.issue && contextTextLower.includes(entities.issue.toLowerCase())) {
    score += 30;
    evidence.push({ signal: 'issue_match', description: `Matched issue: ${entities.issue}`, score: 30 });
  }

  if (entities.file && contextTextLower.includes(entities.file.toLowerCase())) {
    score += 20;
    evidence.push({ signal: 'file_match', description: `Matched file: ${entities.file}`, score: 20 });
  }

  if (entities.topic && entities.topic.length > 2 && contextTextLower.includes(entities.topic.toLowerCase())) {
    score += 25;
    evidence.push({ signal: 'topic_match', description: `Matched topic: "${entities.topic}"`, score: 25 });
  }

  // ─── Guard against Topic Shift: Must have substantive topical agreement ───
  const hasTopicMatch = kwSim >= 0.15 || shared.length >= 1 || 
    (context.name && (activityTitleLower.includes(context.name.toLowerCase()) || contextTextLower.includes(activityTitleLower))) ||
    Boolean(entities.topic && contextTextLower.includes(entities.topic.toLowerCase()));

  // ─── 3. TEMPORAL (Proximity boost - only given if topic has some connection) ───
  const timeDiffHours = (new Date() - new Date(context.updatedAt)) / (1000 * 60 * 60);
  if (hasTopicMatch) {
    if (timeDiffHours < 0.5) {
      score += 8;
      evidence.push({ signal: 'temporal', description: 'Active within the last 30 minutes.', score: 8 });
    } else if (timeDiffHours < 4) {
      score += 4;
      evidence.push({ signal: 'temporal', description: 'Active within the last 4 hours.', score: 4 });
    }
  } else {
    // Zero topical connection -> Severe penalty to trigger clean context shift
    score -= 30;
  }

  // ─── 4. SEMANTIC SIMILARITY ─────────────────────────────────────
  const hasRealEmbedding = eventEmbedding && context.embedding && 
    eventEmbedding.length > 0 && context.embedding.length > 0 &&
    eventEmbedding.some(v => v !== 0) && context.embedding.some(v => v !== 0);
    
  if (hasRealEmbedding) {
    const similarity = cosineSimilarity(eventEmbedding, context.embedding);
    if (similarity > 0.45) {
      const semanticScore = Math.min(35, Math.floor((similarity - 0.40) * 60));
      score += semanticScore;
      evidence.push({ signal: 'semantic_match', description: `Semantic similarity ${(similarity*100).toFixed(1)}%`, score: semanticScore });
    }
  }

  // ─── 5. NEGATIVE EVIDENCE (Penalties) ───────────────────────────
  if (entities.project && contextTextLower.includes('project') && !contextTextLower.includes(entities.project.toLowerCase())) {
    score -= 20;
    evidence.push({ signal: 'conflict', description: `Conflicting project entity`, score: -20 });
  }

  if (entities.issue && contextTextLower.includes('issue') && !contextTextLower.includes(entities.issue.toLowerCase())) {
    score -= 15;
    evidence.push({ signal: 'conflict', description: `Conflicting issue entity`, score: -15 });
  }

  // One generic shared word is insufficient to attach otherwise different tasks.
  const substantive = shared.length >= 2 || evidence.some(x => ['project_match', 'issue_match', 'file_match', 'topic_match'].includes(x.signal)) || kwSim >= 0.6;
  if (!substantive) score = Math.min(score, 24);
  const finalScore = Math.max(0, Math.min(100, score));

  return {
    score: finalScore,
    accepted: finalScore >= 25,
    evidence,
    isHighConfidence: finalScore >= 45,
    isMediumConfidence: finalScore >= 25 && finalScore < 45,
  };
}
