export function normalizeJudgment(result) {
  const confidence = Number(result?.confidence);
  return {
    related: result?.related === true,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence > 1 ? confidence / 100 : confidence)) : 0,
    reason: Array.isArray(result?.reason) ? result.reason.filter(x => typeof x === 'string').slice(0, 5) : [],
    status: result?.status === 'AI_UNAVAILABLE' ? 'AI_UNAVAILABLE' : result?.related === true ? 'AI_SUCCESS' : 'AI_REJECTED',
    model: result?.model || 'unknown'
  };
}
export function matchDecision(evidence, judgment) {
  if (evidence.isHighConfidence) return 'MERGE';
  const ai = normalizeJudgment(judgment || { status: 'AI_UNAVAILABLE' });
  if (ai.status === 'AI_REJECTED') return 'SEPARATE';
  if (ai.status === 'AI_SUCCESS') return ai.related && ai.confidence >= 0.65 ? 'MERGE' : 'UNCERTAIN';
  return evidence.score >= 30 ? 'MERGE' : 'UNCERTAIN';
}
