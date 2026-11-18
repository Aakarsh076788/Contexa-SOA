import test from 'node:test';
import assert from 'node:assert';
import { retrieveCandidates, correlationEvidence } from '../backend/engine/correlate.js';

test('Candidate Retrieval Layer Tests', async (t) => {
  const baseContext = {
    id: 'ctx_1',
    name: 'Telugu movies',
    topic: 'Telugu movies',
    description: '',
    sessionNote: '',
    updatedAt: new Date().toISOString(),
    sources: ['chrome'],
    // Mock embedding: a non-zero vector
    embedding: new Array(3072).fill(0.01)
  };
  
  // To simulate cosine similarity easily, if event is same as context, it's 1.0. 
  // We'll mock the eventEmbedding appropriately.
  // Actually, cosineSimilarity in embed.js computes dot product.
  // We can just pass identical arrays for 1.0, or arrays with 0s for 0.0.
  const similarEmbedding = new Array(3072).fill(0.01); 
  const dissimilarEmbedding = new Array(3072).fill(0).map((v, i) => i % 2 === 0 ? 0.01 : -0.01);

  await t.test('A/B. "Telugu movies" + "Prabhas upcoming films" -> Candidate retrieved but not high confidence', () => {
    const activity = { source: 'chrome', title: 'Prabhas upcoming films', detail: '' };
    const entities = { topic: 'Prabhas upcoming films' }; // No substring match
    
    // We want semantic similarity > 0.55 (retrieval threshold), e.g., 0.65
    // Rather than precise vectors, we just know the function computes it.
    // If we pass `similarEmbedding`, similarity = 1.0 > 0.55.
    const candidates = retrieveCandidates([baseContext], activity, entities, similarEmbedding);
    
    assert.strictEqual(candidates.length, 1, 'Should retrieve candidate based on semantics despite no lexical overlap');
    assert.ok(candidates[0].reasons.some(r => r.includes('Semantic similarity')), 'Should indicate semantic reason');
    
    const evidence = correlationEvidence(candidates[0].item, activity, entities, similarEmbedding);
    assert.strictEqual(evidence.isHighConfidence, false, 'Should NOT automatically merge (high confidence)');
  });

  await t.test('C/D. Weakly related activities -> Not automatically merged, and candidate retrieval does not merge', () => {
    // Let's create an activity with some keyword overlap but low semantics
    const activity = { source: 'chrome', title: 'Telugu weather', detail: '' };
    const entities = { topic: 'Weather' };
    
    const candidates = retrieveCandidates([baseContext], activity, entities, dissimilarEmbedding);
    
    // Keyword 'telugu' overlaps, so kwSim > 0.10 => retrieved
    assert.strictEqual(candidates.length, 1, 'Retrieved via keyword overlap');
    assert.ok(candidates[0].reasons.some(r => r.includes('Keyword overlap')), 'Should indicate keyword reason');
    
    const evidence = correlationEvidence(candidates[0].item, activity, entities, dissimilarEmbedding);
    assert.strictEqual(evidence.isHighConfidence, false, 'Does not merge');
    assert.strictEqual(evidence.isMediumConfidence, false, 'Does not even hit medium confidence deterministically');
  });

  await t.test('E. Negative evidence lowers score during final evaluation', () => {
    const activity = { source: 'vscode', title: 'Editing file.js', detail: '' };
    const entities = { project: 'DifferentProject' };
    
    // Base context has 'project' in text but different name, let's mock it
    const codeContext = {
      ...baseContext,
      name: 'Project Alpha',
      topic: 'Project Alpha',
      sources: ['vscode']
    };
    
    const candidates = retrieveCandidates([codeContext], activity, entities, similarEmbedding);
    assert.strictEqual(candidates.length, 1, 'Retrieved due to semantic similarity');
    
    const evidence = correlationEvidence(codeContext, activity, entities, similarEmbedding);
    assert.ok(evidence.evidence.some(e => e.signal === 'conflict'), 'Should have negative conflict evidence');
    assert.ok(evidence.score < 100, 'Score should be penalized');
  });
});
