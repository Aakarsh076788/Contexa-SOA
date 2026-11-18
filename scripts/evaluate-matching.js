import { readFile } from 'node:fs/promises';
import { correlationEvidence } from '../backend/engine/correlate.js';
import { extractEntitiesLocal } from '../backend/engine/local.js';
import { evaluateContextMatch } from '../backend/engine/ai.js';
import { matchDecision } from '../backend/services/matching.js';
const cases = JSON.parse(await readFile(new URL('../tests/fixtures/matching.json', import.meta.url), 'utf8'));
const mode = process.argv.includes('--local') ? 'rules + local ML' : process.argv.includes('--cloud') ? 'rules + local ML + cloud fallback' : 'rules';
if (mode.includes('cloud') && process.env.ALLOW_CLOUD_EVALUATION !== 'true') throw new Error('Set ALLOW_CLOUD_EVALUATION=true to explicitly permit cloud processing of the fixture texts.');
const counts = { truePositive: 0, trueNegative: 0, falseMerge: 0, missedMatch: 0, uncertain: 0 };
const errors = [];
for (const item of cases) {
  const context = { name: item.context, topic: item.context, updatedAt: new Date(0), embedding: [] };
  const activity = { source: 'chrome', title: item.activity, detail: '' };
  const evidence = correlationEvidence(context, activity, extractEntitiesLocal(activity), []);
  const judgment = mode === 'rules' || evidence.isHighConfidence ? null : await evaluateContextMatch(context, activity, { allowCloud: mode.includes('cloud') });
  const decision = matchDecision(evidence, judgment);
  const positive = decision === 'MERGE';
  if (decision === 'UNCERTAIN') counts.uncertain++;
  counts[positive ? item.related ? 'truePositive' : 'falseMerge' : item.related ? 'missedMatch' : 'trueNegative']++;
  if (positive !== item.related) errors.push({ ...item, decision, score: evidence.score });
}
console.log(JSON.stringify({ mode, samples: cases.length, ...counts, precision: counts.truePositive / Math.max(1, counts.truePositive + counts.falseMerge), recall: counts.truePositive / Math.max(1, counts.truePositive + counts.missedMatch), errors, limitations: 'Small hand-labeled regression fixture, not a real-world accuracy benchmark. No embeddings in this evaluation. Run against representative consented workflow examples before changing production thresholds.' }, null, 2));
