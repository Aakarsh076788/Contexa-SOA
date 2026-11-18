import { ContextaConnector } from './sdk.js';
import { githubRequest } from '../engine/github.js';

export class GitHubConnector extends ContextaConnector {
  constructor() {
    super({
      id: 'github',
      name: 'GitHub',
      transport: 'oauth',
      scopes: ['repo', 'user']
    });
  }

  async healthCheck(workspace) {
    if (!workspace?.github?.token) {
      return false;
    }
    
    try {
      await githubRequest(workspace.github.token, '/user');
      return true;
    } catch (err) {
      return false;
    }
  }

  normalizeEvent(rawEvent) {
    // rawEvent represents an issue or pull request along with a repository object
    // Assuming rawEvent has the structure similar to what the API returns,
    // we also need `repo.full_name` which might be passed in or extracted.
    // Let's assume rawEvent includes a `repository` property or we extract it from `repository_url`.
    
    // As a generic approach to match engine/github.js format:
    const isPull = Boolean(rawEvent.pull_request);
    const title = `${isPull ? 'Pull request' : 'Issue'} #${rawEvent.number} · ${rawEvent.title}`;
    
    // Extract repository full name from rawEvent if present or from url
    let repoFullName = 'unknown/repo';
    if (rawEvent.repository) {
      repoFullName = rawEvent.repository.full_name;
    } else if (rawEvent.repository_url) {
      const parts = rawEvent.repository_url.split('/');
      repoFullName = `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
    }
    
    const detail = `${repoFullName} · ${rawEvent.state}${rawEvent.user?.login ? ` · ${rawEvent.user.login}` : ''}`;
    
    return {
      source: 'github',
      type: isPull ? 'pull_request' : 'issue',
      title,
      detail,
      project: repoFullName,
      entity: title,
      entityType: isPull ? 'pull_request' : 'issue',
      kind: isPull ? 'REVIEW' : 'ISSUE',
      href: rawEvent.html_url,
      metadata: {
        repository: repoFullName,
        state: rawEvent.state
      }
    };
  }
}
