
/**
 * Generates a 768-dimensional embedding vector for the given text.
 * 
 * @param {string} text - The text to embed
 * @returns {Promise<number[]>} - The embedding vector
 */
export async function generateEmbedding(text, { allowCloud = false } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
  if (!allowCloud || !apiKey || !text) {
    return []; // Return empty array to explicitly indicate unavailable embedding
  }

  try {
    // Prefer Gemini for embeddings since it's free, unless they explicitly removed the key
    const isGemini = !!process.env.GEMINI_API_KEY;
    const usedKey = isGemini ? process.env.GEMINI_API_KEY : apiKey;
    
    const endpoint = isGemini ? 
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${usedKey}` : 
      "https://openrouter.ai/api/v1/embeddings";

    const body = isGemini ? 
      JSON.stringify({ content: { parts: [{ text }] } }) :
      JSON.stringify({
        model: process.env.OPENROUTER_EMBEDDING_MODEL || "text-embedding-3-small", 
        input: text
      });

    const headers = isGemini ? { "Content-Type": "application/json" } : {
      "Authorization": `Bearer ${usedKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:5173",
      "X-Title": "Contexa"
    };

    const response = await fetch(endpoint, { method: "POST", headers, body, signal: AbortSignal.timeout(8000) });
    
    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = await response.json();
    const values = isGemini ? data.embedding?.values : data.data?.[0]?.embedding;
    return Array.isArray(values) && values.length <= 8192 && values.every(Number.isFinite) ? values : [];
  } catch (error) {
    console.error("Embedding generation failed:", error.message);
    return [];
  }
}

/**
 * Calculates the cosine similarity between two vectors.
 * 
 * @param {number[]} vecA 
 * @param {number[]} vecB 
 * @returns {number} - Similarity score between 0 and 1
 */
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i] || 0;
    const b = vecB[i] || 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
