import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { correlationEvidence } from '../backend/engine/correlate.js';
import { extractEntitiesLocal } from '../backend/engine/local.js';
import { matchDecision } from '../backend/services/matching.js';
const cases = JSON.parse(await readFile(new URL('./fixtures/matching.json', import.meta.url), 'utf8'));
test('labeled different-task fixtures never auto-merge with rules alone', () => {
  for (const item of cases.filter(x => !x.related)) {
    const activity = { source: 'chrome', title: item.activity, detail: '' };
    const evidence = correlationEvidence({ name: item.context, topic: item.context, updatedAt: new Date(0) }, activity, extractEntitiesLocal(activity), []);
    assert.notEqual(matchDecision(evidence), 'MERGE', `${item.context} incorrectly merged with ${item.activity}`);
  }
});
