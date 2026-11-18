/**
 * Determines the context state from an activity signal.
 * 
 * @param {Object} activity - The activity object to analyze
 * @returns {string} The computed state
 */
export function stateFrom(activity) {
  const text = `${activity.type} ${activity.title} ${activity.detail}`.toLowerCase();
  
  if (/(?:done|merged|closed|completed|finish)/i.test(text)) return 'COMPLETED';
  if (activity.source === 'github' && /pull|pr|review/i.test(text)) return 'REVIEW';
  if (/(?:test|localhost|preview|verify|jest|mocha|cypress)/i.test(text) || (activity.source === 'chrome' && /test|localhost|preview|verify/i.test(text))) return 'TESTING';
  if (activity.source === 'vscode' || /(?:code|implement|fix|refactor|write)/i.test(text)) return 'IMPLEMENTATION';
  if (/(?:issue|bug|ticket|jira|investigate)/i.test(text) || (activity.source === 'github' && /issue/i.test(text))) return 'INVESTIGATION';
  
  return 'DISCOVERY';
}
