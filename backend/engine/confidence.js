export function calculateConfidence(evidenceEntries, baseConfidence = 50) {
  const totalScore = evidenceEntries.reduce((sum, e) => sum + e.score, 0);
  const confidence = Math.min(99, Math.max(0, baseConfidence + totalScore));
  return {
    confidence,
    evidence: evidenceEntries
  };
}
