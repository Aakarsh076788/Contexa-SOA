/**
 * Returns the current ISO timestamp.
 * @returns {string} The ISO timestamp.
 */
export const now = () => new Date().toISOString();

/**
 * Formats a date with weekday, day, and month.
 * @param {string|number|Date} value - The date to format.
 * @returns {string} The formatted date.
 */
export const date = (value) => new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(value));

/**
 * Formats a time in HH:MM format.
 * @param {string|number|Date} value - The time to format.
 * @returns {string} The formatted time.
 */
export const time = (value) => new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));

export const ignoredWords = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'with', 'from', 'that', 'this', 'then', 'the', 'for', 'into', 'your', 'you', 'was', 'were', 'has', 'have', 'using', 'page', 'file', 'code',
  'youtube', 'youtu', 'netflix', 'spotify', 'facebook', 'instagram', 'twitter', 'tiktok', 'reddit', 'amazon', 'twitch', 'whatsapp', 'telegram', 'video', 'videos', 'watch', 'music', 'song', 'songs', 'movie', 'movies', 'stream'
]);

export const genericTokens = new Set([
  'saved', 'opened', 'edited', 'file', 'test', 'javascript', 'workspace', 'code', 'page', 'activity',
  'youtube', 'netflix', 'spotify', 'facebook', 'instagram', 'twitter', 'tiktok', 'reddit', 'amazon', 'twitch', 'whatsapp', 'telegram', 'video', 'videos', 'watch', 'music', 'home', 'feed'
]);

export const sourceNames = { chrome: 'Chrome', vscode: 'VS Code', discord: 'Discord', github: 'GitHub', telegram: 'Telegram' };

export const sources = Object.keys(sourceNames);

/**
 * Tokenizes values by removing ignored words.
 * @param {...string} values - The strings to tokenize.
 * @returns {string[]} The resulting tokens.
 */
export const words = (...values) => [...new Set(values.join(' ').toLowerCase().match(/[a-z0-9_/-]{3,}/g)?.filter((word) => !ignoredWords.has(word)) ?? [])];
