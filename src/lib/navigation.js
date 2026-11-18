const paths = {
  Overview: '/', Contexts: '/contexts', Inbox: '/inbox', Timeline: '/timeline',
  Insights: '/insights', Connectors: '/connectors', Settings: '/settings', Admin: '/admin'
};

// Only known routes can become application state, including on a copied URL.
export function readRoute(location = window.location) {
  const pathname = location.pathname.replace(/\/+$/, '') || '/';
  if (pathname === '/reset-password') return { page: 'Overview', contextId: null, valid: true, authAction: 'reset' };
  const page = Object.keys(paths).find(name => paths[name] === pathname);
  if (page) return { page, contextId: null, valid: true };
  const match = pathname.match(/^\/contexts\/([^/]+)$/);
  if (match) {
    try {
      const contextId = decodeURIComponent(match[1]);
      if (contextId && contextId.length <= 200 && !/[\s/\\?#]/.test(contextId)) return { page: 'Context Details', contextId, valid: true };
    } catch { /* A malformed escaped path is an unknown route. */ }
  }
  return { page: 'Overview', contextId: null, valid: false };
}

export function routePath(page, contextId) {
  if (page === 'Context Details' && contextId) return `/contexts/${encodeURIComponent(contextId)}`;
  return paths[page] || '/';
}
