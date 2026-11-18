/**
 * Local Entity Extractor — works WITHOUT any API calls.
 * Uses deterministic text analysis to extract topics from page titles.
 */

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
  'should', 'may', 'might', 'can', 'could', 'and', 'but', 'or', 'nor',
  'not', 'so', 'yet', 'both', 'either', 'neither', 'each', 'every',
  'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'only', 'own', 'same', 'than', 'too', 'very', 'just', 'because',
  'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with', 'about',
  'against', 'between', 'through', 'during', 'before', 'after', 'above',
  'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'what', 'which', 'who', 'whom', 'this', 'that',
  'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he',
  'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their',
  'www', 'com', 'org', 'net', 'http', 'https', 'html', 'page', 'home',
  'search', 'google', 'result', 'results', 'site', 'website', 'web',
  'online', 'free', 'best', 'top', 'new', 'get', 'find', 'learn',
  'guide', 'tutorial', 'review', 'reviews', 'news', 'blog', 'post',
  'article', 'articles', 'definition', 'meaning', 'examples', 'example',
  'youtube', 'youtu', 'netflix', 'spotify', 'facebook', 'instagram', 'twitter', 'x',
  'tiktok', 'reddit', 'amazon', 'twitch', 'whatsapp', 'telegram', 'primevideo',
  'hotstar', 'video', 'videos', 'watch', 'music', 'song', 'songs',
  'stream', 'feed', 'inbox', 'mail', 'gmail', 'notifications',
  'general', 'random', 'channel', 'server', 'chat', 'discord', 'message', 'messages', 
  'guys', 'hey', 'hello', 'look', 'find', 'found', 'got', 'give', 'one', 'two', 'also', 'see', 'time', 'now', 'will', 'let', 'lets', 'good', 'different'
]);

/**
 * Normalize a word: lowercase, strip trailing punctuation, handle basic plurals
 */
function stem(word) {
  let w = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (w.length <= 2) return '';
  // Very basic stemming — just handle common suffixes
  if (w.endsWith('ies') && w.length > 4) w = w.slice(0, -3) + 'y';
  else if (w.endsWith('es') && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) w = w.slice(0, -1);
  if (w.endsWith('ing') && w.length > 5) w = w.slice(0, -3);
  if (w.endsWith('tion') && w.length > 5) w = w.slice(0, -4) + 't';
  return w;
}

/**
 * Extract meaningful keyword stems from text
 */
export function keywords(text) {
  if (!text) return [];
  return [...new Set(text
    .split(/[\s\-_|:·•\/\\,;!?()\[\]{}""'']+/)
    .map(stem)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w)))];
}

/**
 * Extract a clean search query from a Google Search page title.
 * "Telugu cinemas - Google Search" → "Telugu cinemas"
 */
function extractSearchQuery(title) {
  const googleMatch = title.match(/^(.+?)\s*[-–—]\s*Google\s*Search$/i);
  if (googleMatch) return googleMatch[1].trim();
  
  const bingMatch = title.match(/^(.+?)\s*[-–—]\s*Bing$/i);
  if (bingMatch) return bingMatch[1].trim();

  return null;
}

/**
 * Local entity extraction — no AI needed.
 */
export function extractEntitiesLocal(activity) {
  const title = activity.title || '';
  const detail = activity.detail || '';
  
  // Try to extract search query
  const searchQuery = extractSearchQuery(title);
  
  // Extract the most meaningful words as the topic
  const sourceText = searchQuery || title;
  const kws = keywords(sourceText);
  const topic = kws.slice(0, 3).join(' ') || sourceText.slice(0, 30);
  
  return {
    issue: title.match(/(?:[A-Z]{2,}-\d+|#\d+)/)?.[0] || null,
    file: activity.entityType === 'file' ? activity.entity : null,
    topic,
    project: activity.source === 'chrome' ? null : activity.project || null,
    searchQuery,
    keywords: kws
  };
}

/**
 * Calculate how similar two sets of keywords are.
 * Returns a score from 0 to 1, taking into account subset overlap.
 */
export function keywordSimilarity(wordsA, wordsB) {
  if (!wordsA.length || !wordsB.length) return 0;
  
  let matches = 0;
  const used = new Set();
  for (const a of [...new Set(wordsA)]) {
    for (const [index, b] of wordsB.entries()) {
      if (used.has(index)) continue;
      // Exact match
      if (a === b) { matches++; used.add(index); break; }
      // Prefix match (e.g. "cinema" matches "cinematic", "car" matches "cars")
      if (a.length >= 5 && b.length >= 5) {
        const prefix = Math.min(a.length, b.length) - 1;
        if (a.slice(0, prefix) === b.slice(0, prefix)) { matches += 0.85; used.add(index); break; }
      }
    }
  }
  
  const minLen = Math.min(wordsA.length, wordsB.length);
  const unionSize = new Set([...wordsA, ...wordsB]).size;
  
  const jaccard = unionSize > 0 ? matches / unionSize : 0;
  const overlap = minLen > 0 ? matches / minLen : 0;
  
  // Blended similarity: heavily rewards subset matches (e.g. "bmw" matching "bmw m5 car")
  return Math.min(1, Math.max(jaccard, overlap * 0.9));
}
