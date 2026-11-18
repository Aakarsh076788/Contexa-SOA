import { normalizeJudgment } from '../services/matching.js';
import { sourceNames } from '../utils/format.js';

/**
 * Analyzes the context and its event timeline using Google Gemini to generate structured insights.
 */
export async function generateAiSummary(context, events, { allowCloud = false } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  // Fall back to a deterministic summary of observed records when cloud AI is unavailable
  if (!allowCloud || !apiKey) {
    return generateObservedSummary(context, events);
  }

  try {
    // Format the timeline for the LLM
    const timeline = events.slice(0, 100).map(e => `[${e.source}] ${e.kind}: ${e.title} ${e.detail ? '- ' + e.detail : ''}`).join('\n');
    
    const prompt = `You are Contexa, an intelligent context-aware developer assistant. 
    Analyze the following chronological timeline of cross-application activity for a task called "${context.topic}" (Status: ${context.state}).
    
    Activity Timeline:
    ${timeline}
    
    Provide a deeply analytical summary of this work. Identify any specific errors/bugs the user encountered (especially from terminal/VS Code), any open leads or tabs they were researching but didn't finish, and suggest exactly what they should do next to move the task forward.
    
    You MUST respond with ONLY valid JSON matching this exact structure:
    {
      "headline": "A punchy 1-sentence summary",
      "narrative": "A detailed 2-3 sentence human-readable summary",
      "errors": ["Specific errors or stack traces", ...],
      "leads": ["Open threads or unanswered questions", ...],
      "nextAction": "The single most logical next step"
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
        max_tokens: 1000,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    if (typeof result.headline !== 'string' || typeof result.narrative !== 'string') throw new Error('Invalid summary response');
    return { status: 'AI_SUCCESS', headline: result.headline.slice(0, 300), narrative: result.narrative.slice(0, 3000), errors: Array.isArray(result.errors) ? result.errors.filter(x => typeof x === 'string').slice(0, 20) : [], leads: Array.isArray(result.leads) ? result.leads.filter(x => typeof x === 'string').slice(0, 20) : [], nextAction: typeof result.nextAction === 'string' ? result.nextAction.slice(0, 300) : context.nextAction };

  } catch (error) {
    console.error("Gemini AI generation failed:", error.message);
    return generateObservedSummary(context, events);
  }
}

/**
 * Fallback generator when offline or missing API key
 */
function generateObservedSummary(context, events) {
  const sourceList = [...new Set(events.map((entry) => sourceNames[entry.source]))];
  const implementation = events.filter((entry) => entry.source === 'vscode' || entry.kind === 'IMPLEMENTATION');
  const research = events.filter((entry) => entry.source === 'chrome' || entry.kind === 'RESEARCH');
  const discussion = events.filter((entry) => entry.source === 'discord' || entry.kind === 'CONVERSATION');
  const review = events.filter((entry) => entry.source === 'github');

  const headline = `Working on "${context.topic}" (${context.state.toLowerCase()}).`;
  
  let narrative = '';
  if (discussion.length) narrative += `Discussed in ${discussion.length} conversation${discussion.length > 1 ? 's' : ''}. `;
  if (research.length) narrative += `Researched across ${research.length} page${research.length > 1 ? 's' : ''}. `;
  if (implementation.length) narrative += `Code changes in ${implementation.length} file${implementation.length > 1 ? 's' : ''}. `;
  if (review.length) narrative += `${review.length} GitHub signal${review.length > 1 ? 's' : ''} tracking progress. `;
  if (!narrative) narrative = `Captured ${events.length} signals from ${sourceList.join(', ')}. `;

  return {
    status: 'AI_UNAVAILABLE',
    headline,
    narrative: narrative.trim(),
    errors: [],
    leads: [],
    nextAction: "Continue working on the task."
  };
}

/**
 * Context Scoring Engine: Evaluates activity correlation using the local PyTorch Deep Learning model (ContexaNet).
 * Falls back to OpenRouter/Gemini LLM if local PyTorch service is offline.
 * 
 * @param {Object} context - The existing context candidate
 * @param {Object} activity - The new incoming activity
 * @returns {Promise<Object>} { related: boolean, confidence: number, reason: string[], status: string, model: string }
 */
export async function evaluateContextMatch(context, activity, { allowCloud = false, deadline = Date.now() + 10000 } = {}) {
  // 1. Primary Engine: Local PyTorch Siamese Neural Network (ContexaNet)
  try {
    const mlBase = process.env.CONTEXA_ML_URL || 'http://127.0.0.1:5001';
    const mlUrl = new URL('/predict', mlBase);
    // A remote inference service is a cloud processor and requires the same consent.
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(mlUrl.hostname);
    if (!['http:', 'https:'].includes(mlUrl.protocol) || (!loopback && !allowCloud)) throw new Error('Remote inference requires cloud processing consent.');
    const mlResponse = await fetch(mlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context, activity }),
      signal: AbortSignal.timeout(Math.max(1, Math.min(1500, deadline - Date.now()))) // 1.5s timeout for fast local response
    });

    if (mlResponse.ok) {
      const mlData = await mlResponse.json();
      if (mlData.status === 'AI_SUCCESS') {
        return normalizeJudgment(mlData);
      }
    }
  } catch (mlErr) {
    // Local ML server offline or timing out; continue to secondary cloud fallback
  }

  // 2. Secondary Engine: OpenRouter / Gemini Cloud LLM Fallback
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!allowCloud || !apiKey || Date.now() >= deadline) {
    return { related: false, confidence: 0, reason: ["AI_UNAVAILABLE"], status: "AI_UNAVAILABLE" };
  }

  try {
    const prompt = `You are the Context Scoring Engine for Contexa.
    Determine if the following new event belongs to the existing user work context.

    EXISTING CONTEXT:
    Name: ${context.name}
    Topic: ${context.topic}
    Description: ${context.description || 'None'}
    
    NEW EVENT:
    Source: ${activity.source}
    Title: ${activity.title}
    Details: ${activity.detail || 'None'}

    CRITICAL RULES:
    1. Are these events part of the EXACT same goal or task?
    2. Users often multitask (e.g. checking Meta Ads, then writing Authentication code). If the topics are functionally different, you MUST say false, even if they happened at the same time.
    3. A Google Search and a resulting webpage click are ALWAYS related if the topics match.
    4. Do not assume correlation without evidence.
    5. If the new event is generic (like opening google.com), say false.
    
    You must be brutally strict. Return true ONLY if there is clear, undeniable semantic overlap indicating they are the same continuous stream of thought/work.
    
    You MUST respond with ONLY valid JSON matching this exact structure:
    {
      "related": true/false,
      "confidence": 0.0 to 1.0,
      "reason": ["short reason 1", "short reason 2"]
    }`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(Math.max(1, Math.min(8000, deadline - Date.now()))),
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
    const result = JSON.parse(data.choices[0].message.content);
    result.status = result.related ? 'AI_SUCCESS' : 'AI_REJECTED';
    result.model = 'OpenRouter-Gemini-Cloud';
    return normalizeJudgment(result);

  } catch (error) {
    console.error("AI Context Match fallback failed:", error.message);
    return { related: false, confidence: 0, reason: ["AI_UNAVAILABLE"], status: "AI_UNAVAILABLE" };
  }
}
