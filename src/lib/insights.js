export function activityInsights(events, period = 'This week', now = new Date()) {
  const end = new Date(now); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() - (end.getDay() + 6) % 7);
  const start = new Date(end);
  if (period === 'Last week') start.setDate(start.getDate() - 7);
  const until = period === 'Last week' ? end : now;
  const records = events.filter(x => x.type !== 'dismissed' && x.kind !== 'DIAGNOSTIC' && new Date(x.createdAt) >= start && new Date(x.createdAt) <= until).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  let switches = 0, previous = null;
  for (const event of records) if (event.contextId) { if (previous && previous !== event.contextId) switches++; previous = event.contextId; }
  return { records, total: records.length, contexts: new Set(records.map(x => x.contextId).filter(Boolean)).size, sources: new Set(records.map(x => x.source)).size, switches, days: Array.from({ length: 7 }, (_, i) => { const day = new Date(start); day.setDate(day.getDate() + i); return { label: day.toLocaleDateString(undefined, { weekday: 'short' }), count: records.filter(x => new Date(x.createdAt).toDateString() === day.toDateString()).length }; }) };
}
