
/**
 * Extracts structured entities from an activity using Gemini.
 * Maps chaotic inputs (like Discord messages or GitHub issues) into
 * deterministic entities for high-confidence matching.
 * 
 * @param {Object} activity - The incoming activity
 * @returns {Promise<Object>} - The extracted entities
 */
export async function extractEntities(activity, { allowCloud = false } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!allowCloud || !apiKey) {
    return {
      issue: null,
      file: null,
      topic: activity.title || null,
      project: activity.project || null
    };
  }

  try {
    const prompt = `Extract core entities from this workspace activity.
    Source: ${activity.source}
    Title: ${activity.title}
    Detail: ${activity.detail || 'None'}
    Current Project Metadata: ${activity.project || 'None'}
    Current Entity Metadata: ${activity.entity || 'None'}
    
    You MUST respond with ONLY valid JSON matching this exact structure:
    {
      "issue": "The issue ID (e.g. LOGIN-142, #142) if mentioned, or null",
      "file": "The specific file name (e.g. login.js) if mentioned, or null",
      "topic": "A short 1-3 word normalized topic (e.g. authentication, payment). REQUIRED.",
      "project": "The project or repository name, or null"
    }`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
        max_tokens: 200,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    const result = Object.fromEntries(['issue', 'file', 'topic', 'project'].map(key => [key, typeof parsed[key] === 'string' ? parsed[key].slice(0, 200) : null]));
    return {
      issue: result.issue || null,
      file: result.file || null,
      topic: result.topic || activity.title,
      project: result.project || activity.project || null
    };
  } catch (error) {
    console.error("Entity extraction failed; using local metadata.");
    return {
      issue: null,
      file: null,
      topic: activity.title || null,
      project: activity.project || null
    };
  }
}
