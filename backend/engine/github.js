import { openSecret } from '../services/secrets.js';
import { db } from '../storage/db.js';
import { ingest } from './ingest.js';

export async function githubRequest(token, path) {
  const response = await fetch(`https://api.github.com${path}`, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${openSecret(token)}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'contexa-local-connector' } });
  if (!response.ok) throw new Error(response.status === 401 ? 'GitHub rejected this token. Check its permissions and try again.' : `GitHub request failed (${response.status}).`);
  return response.json();
}

export async function syncGitHub(workspaceId) {
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId } });
  const settings = workspace?.settings && typeof workspace.settings === 'object' ? workspace.settings : {};
  const config = settings.github;
  if (settings.tracking === false || !settings.apps?.github) return { imported: 0, ignored: true, reason: 'tracking_paused' };
  if (!config?.token) throw new Error('Connect GitHub before syncing activity.');
  const repos = await githubRequest(config.token, '/user/repos?affiliation=owner,collaborator&sort=updated&per_page=8');
  let imported = 0;
  for (const repo of repos.slice(0, 5)) {
    const items = await githubRequest(config.token, `/repos/${repo.full_name}/issues?state=all&sort=updated&direction=desc&per_page=8`);
    for (const item of items) {
      const isPull = Boolean(item.pull_request);
      const title = `${isPull ? 'Pull request' : 'Issue'} #${item.number} · ${item.title}`;
      const detail = `${repo.full_name} · ${item.state}${item.user?.login ? ` · ${item.user.login}` : ''}`;
      if (await db.event.findFirst({ where: { workspaceId, source: 'github', title, detail } })) continue;
      const result = await ingest(workspaceId, { source: 'github', type: isPull ? 'pull_request' : 'issue', title, detail, project: repo.full_name, entity: title, entityType: isPull ? 'pull_request' : 'issue', kind: isPull ? 'REVIEW' : 'ISSUE', href: item.html_url, metadata: { repository: repo.full_name, state: item.state } });
      if (!result.ignored) imported += 1;
    }
  }
  await db.connector.updateMany({ where: { workspaceId, source: 'github' }, data: { lastSyncAt: new Date() } });
  return { imported, repositories: repos.length, login: config.login };
}
