// Aggregate in PostgreSQL so counts remain correct when the browser loads one activity page.
export async function workspaceInsights(database, workspaceId, { period = 'This week', timeZone = 'UTC' } = {}) {
  if (!['This week', 'Last week'].includes(period)) throw Object.assign(new Error('Choose This week or Last week.'), { status: 400 });
  try { new Intl.DateTimeFormat('en', { timeZone }).format(); } catch { throw Object.assign(new Error('Choose a valid time zone.'), { status: 400 }); }
  const offset = period === 'Last week' ? 7 : 0;
  const [report] = await database.$queryRaw`
    WITH bounds AS (
      SELECT (date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE ${timeZone})::date - ${offset}::integer) AS start
    ), records AS (
      SELECT e."contextId", e.source, e."createdAt", e.id, (e."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone})::date AS day
      FROM "Event" e, bounds b
      WHERE e."workspaceId" = ${workspaceId} AND e.type <> 'dismissed' AND e.kind <> 'DIAGNOSTIC'
      AND (e."createdAt" AT TIME ZONE 'UTC') >= (b.start::timestamp AT TIME ZONE ${timeZone})
      AND (e."createdAt" AT TIME ZONE 'UTC') < ((b.start + 7)::timestamp AT TIME ZONE ${timeZone}) AND (e."createdAt" AT TIME ZONE 'UTC') <= CURRENT_TIMESTAMP
    ), changes AS (
      SELECT "contextId", lag("contextId") OVER (ORDER BY "createdAt", id) AS previous FROM records WHERE "contextId" IS NOT NULL
    )
    SELECT (SELECT count(*)::int FROM records) AS total,
      (SELECT count(DISTINCT "contextId")::int FROM records) AS contexts,
      (SELECT count(DISTINCT source)::int FROM records) AS sources,
      (SELECT count(*)::int FROM changes WHERE previous IS NOT NULL AND previous <> "contextId") AS switches,
      (SELECT json_agg(json_build_object('label', to_char(d, 'Dy'), 'count', (SELECT count(*)::int FROM records r WHERE r.day = d::date)) ORDER BY d)
        FROM bounds b, generate_series(b.start::timestamp, (b.start + 6)::timestamp, interval '1 day') d) AS days,
      COALESCE((SELECT json_agg(row_to_json(c)) FROM (
        SELECT r."contextId" AS id, c.name, count(*)::int AS count FROM records r
        JOIN "Context" c ON c.id = r."contextId" AND c."workspaceId" = ${workspaceId}
        GROUP BY r."contextId", c.name ORDER BY count(*) DESC, c.name LIMIT 100
      ) c), '[]'::json) AS "byContext"`;
  return report;
}
