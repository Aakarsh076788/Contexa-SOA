import { StrictMode, useCallback, useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './theme.css';
import Appearance from './components/Appearance.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { readRoute, routePath } from './lib/navigation.js';

const pages = {
  Overview: {
    eyebrow: 'WORKSPACE MEMORY',
    title: 'Ready to continue.',
    description: 'Your workspace is ready when you are.'
  },
  Contexts: {
    eyebrow: 'YOUR WORK',
    title: 'Contexts',
    description: 'Your detected workspaces will live here.'
  },
  Inbox: { eyebrow: 'REVIEW YOUR SIGNALS', title: 'Activity inbox', description: 'Review unassigned activity.' },
  Timeline: {
    eyebrow: 'ACTIVITY HISTORY',
    title: 'Timeline',
    description: 'A chronological view of your work across applications.'
  },
  Insights: {
    eyebrow: 'WORK PATTERNS',
    title: 'Insights',
    description: 'Context and focus insights will appear here.'
  },
  Connectors: {
    eyebrow: 'INTEGRATION HUB',
    title: 'Connectors',
    description: 'Connect the tools that make up your work.'
  },
  Settings: {
    eyebrow: 'CONTROL CENTER',
    title: 'Settings',
    description: 'Manage data collection and connected applications.'
  },
  Admin: {
    eyebrow: 'SYSTEM CONTROL',
    title: 'Admin Portal',
    description: 'Platform management, user accounts, and system telemetry.'
  }
};

import { requestApi } from './lib/api.js';
import WorkspaceSearch from './components/WorkspaceSearch.jsx';
import { ComingSoon } from './components/ui.jsx';
import AuthScreen from './pages/AuthScreen.jsx';
import Landing from './pages/Landing.jsx';
import Contexts from './pages/Contexts.jsx';
import ContextDetails from './pages/ContextDetails.jsx';
import Timeline from './pages/Timeline.jsx';
import Insights from './pages/Insights.jsx';
import Settings from './pages/Settings.jsx';
import Connectors from './pages/Connectors.jsx';
import Overview from './pages/Overview.jsx';
import AdminPortal from './pages/AdminPortal.jsx';

function App() {
  const [session, setSession] = useState(null);
  const [view, setView] = useState('loading');
  const [route, setRoute] = useState(readRoute);
  const activePage = route.page;
  const [workspace, setWorkspace] = useState(null);
  const sessionGeneration = useRef(0);
  const inFlight = useRef(null);
  const sessionRequest = useRef(null);
  const [loadError, setLoadError] = useState('');
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [activeContextId, setActiveContextId] = useState(route.contextId);
  const page = pages[activePage] || pages.Overview;

  const navigate = useCallback((nextPage, contextId, search = '') => {
    const path = routePath(nextPage, contextId) + search;
    if (`${window.location.pathname}${window.location.search}` !== path) window.history.pushState({}, '', path);
    setRoute(readRoute());
    if (contextId) setActiveContextId(contextId);
  }, []);
  const setActivePage = nextPage => navigate(nextPage);
  useEffect(() => { document.title = `${activePage === 'Context Details' ? 'Context' : activePage} · Contexa`; }, [activePage]);
  const openContext = id => navigate('Context Details', id);

  useEffect(() => {
    if (!readRoute().valid) window.history.replaceState({}, '', '/');
    const restore = () => {
      const next = readRoute();
      if (!next.valid) window.history.replaceState({}, '', '/');
      setRoute(next);
      if (next.contextId) setActiveContextId(next.contextId);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  // Session secrets stay in the HttpOnly cookie. Old local sessions are used
  // once for migration, then removed even when that session has expired.
  useEffect(() => {
    let active = true;
    if (!sessionRequest.current) {
      let legacyToken;
      try { legacyToken = JSON.parse(localStorage.getItem('contexa-session'))?.token; } catch { /* No valid legacy session. */ }
      sessionRequest.current = requestApi('/api/auth/session', { token: legacyToken }).finally(() => {
        try { localStorage.removeItem('contexa-session'); localStorage.removeItem('contexa-active-page'); } catch { /* Storage may be disabled. */ }
      });
    }
    sessionRequest.current.then(data => { if (active) { setSession(data); setView(window.location.pathname === '/reset-password' ? 'login' : 'app'); } })
      .catch(() => { if (active) setView(window.location.pathname === '/' ? 'landing' : 'login'); });
    return () => { active = false; };
  }, []);

  const loadWorkspace = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const generation = sessionGeneration.current;
    const pending = requestApi('/api/workspace').then(data => {
      if (generation !== sessionGeneration.current) return;
      setWorkspace(data);
      setLoadError('');
      setRefreshedAt(new Date());
      if (data.user) setSession(current => current ? { ...current, user: data.user } : current);
      setActiveContextId(current => readRoute().contextId || (data.contexts.some(item => item.id === current) ? current : data.contexts[0]?.id));
    }).catch(error => {
      if (generation !== sessionGeneration.current) return;
      setLoadError(error.message);
      if (error.status === 401) { sessionGeneration.current++; setSession(null); setWorkspace(null); setView('login'); }
    }).finally(() => { if (inFlight.current === pending) inFlight.current = null; });
    inFlight.current = pending;
    return pending;
  }, []);

  useEffect(() => {
    if (view !== 'app') return;
    loadWorkspace();
    const refresh = () => { if (!document.hidden && navigator.onLine) loadWorkspace(); };
    const connection = () => { setOffline(!navigator.onLine); refresh(); };
    const timer = setInterval(refresh, 60000);
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); window.removeEventListener('online', connection); window.removeEventListener('offline', connection); document.removeEventListener('visibilitychange', refresh); };
  }, [view, loadWorkspace]);

  const handleAuthenticated = newSession => {
    sessionGeneration.current++;
    inFlight.current = null;
    setWorkspace(null);
    setLoadError('');
    setSession(newSession);
    setView('app');
  };
  const handleLogout = async () => {
    try { await requestApi('/api/auth/logout', { method: 'POST' }); }
    catch (error) { if (error.status !== 401) { setLoadError('Couldn’t sign out. Check your connection and try again.'); return; } }
    sessionGeneration.current++; inFlight.current = null; setWorkspace(null); setSession(null); setView('landing'); navigate('Overview');
  };

  const handleUserUpdated = user => setSession(current => ({ ...current, user }));

  if (view === 'loading') return <main className="auth-shell"><div className="loading-state" role="status">Opening your workspace…</div></main>;
  if (view === 'landing') return <Landing onEnter={() => setView('login')} />;
  if (view === 'login') return <AuthScreen onBack={() => { navigate('Overview'); setView('landing'); }} onAuthenticated={handleAuthenticated} />;

  const isAdmin = Boolean(session?.user?.role === 'admin' || workspace?.user?.role === 'admin');

  const navIcons = {
    'Overview': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
    'Contexts': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
    'Timeline': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    'Insights': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    'Connectors': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
    'Admin': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    'Settings': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
  };

  return (
    <main className="app-shell sidebar-layout">
      <a className="skip-link" href="#workspace-content">Skip to workspace</a>
      <aside className="sidebar">
        <button type="button" className="sidebar-brand" onClick={() => setActivePage('Overview')} aria-label="Contexa home">
          <img src="/contexa-logo.png" alt="Contexa" className="brand-logo-img" />
          <div>
            <span>Contexa</span>
            <small>workspace memory</small>
          </div>
        </button>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {Object.keys(pages).filter(item => item !== 'Settings' && (item !== 'Admin' || isAdmin)).map((item) => (
            <button
              key={item}
              type="button"
              className={`${activePage === item ? 'active' : ''} ${item === 'Admin' ? 'admin-nav-item' : ''}`}
              onClick={() => setActivePage(item)}
              aria-current={activePage === item ? 'page' : undefined}
            >
              {activePage === item && <span className="active-indicator" />}
              {navIcons[item] || <span aria-hidden="true">◇</span>}
              <span>{item === 'Inbox' ? `Inbox (${workspace?.counts?.inbox ?? 0})` : item}</span>
              {item === 'Admin' && <span className="admin-badge">ADMIN</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className={`sidebar-user-button ${activePage === 'Settings' ? 'active' : ''}`}
            onClick={() => setActivePage('Settings')}
            title="Settings & Profile"
            aria-current={activePage === 'Settings' ? 'page' : undefined}
          >
            {activePage === 'Settings' && <span className="active-indicator" />}
            <div className="sidebar-avatar">{session?.user?.name ? session.user.name.charAt(0).toUpperCase() : '?'}</div>
            <div className="sidebar-user-info">
              <strong>{session?.user?.name || 'User'}</strong>
              <span>{session?.user?.email || 'Settings'}</span>
            </div>
            <div className="sidebar-user-action">
              {navIcons['Settings']}
            </div>
          </button>
          <div className={`sidebar-tracking ${workspace?.settings?.tracking ? 'on' : 'off'}`}>
            <i />
            {workspace?.settings?.tracking ? 'Tracking active' : 'Tracking paused'}
          </div>
        </div>
      </aside>

      <div className="main-content" id="workspace-content"><header className="workspace-topbar"><WorkspaceSearch token={session?.token} onOpenContext={openContext} onTimeline={eventId => navigate('Timeline', null, eventId ? `?event=${encodeURIComponent(eventId)}` : '')} /><Appearance /></header>{(offline || refreshedAt) && <p className={`workspace-freshness ${offline ? 'is-offline' : ''}`} role="status">{offline ? 'You’re offline. Showing your last loaded workspace.' : `Updated ${refreshedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</p>}{loadError && <div className="settings-notice" role="alert">{loadError}<button onClick={() => loadWorkspace()}>Retry</button></div>}
        <ErrorBoundary resetKey={`${activePage}:${activeContextId}`} onHome={() => navigate('Overview')}><section key={activePage} data-page={activePage} className="page-content page-enter" aria-live="polite">
          {activePage !== 'Inbox' && activePage !== 'Contexts' && activePage !== 'Context Details' && activePage !== 'Timeline' && activePage !== 'Insights' && activePage !== 'Settings' && activePage !== 'Connectors' && activePage !== 'Admin' && <><p className="eyebrow">{page.eyebrow}</p><h1>{page.title}</h1><p className="description">{page.description}</p></>}

          {!workspace && !loadError && <div className="loading-state" role="status">Loading your workspace…</div>}
          {workspace && (activePage === 'Overview' ? <Overview context={workspace.contexts.find((item) => item.id === activeContextId && item.state !== 'COMPLETED' && item.state !== 'ARCHIVED') ?? workspace.contexts.find(item => item.state !== 'COMPLETED' && item.state !== 'ARCHIVED') ?? workspace.contexts[0]} contexts={workspace.contexts} events={workspace.events} counts={workspace.counts} connectors={workspace.connectors} token={session?.token} onChanged={loadWorkspace} onResume={openContext} onNavigate={setActivePage} /> : activePage === 'Contexts' ? <Contexts contexts={workspace.contexts} token={session?.token} onChanged={loadWorkspace} onOpenContext={openContext} /> : activePage === 'Context Details' ? <ContextDetails contexts={workspace.contexts} key={activeContextId} contextId={activeContextId} token={session?.token} onChanged={loadWorkspace} onBack={() => setActivePage('Contexts')} /> : activePage === 'Inbox' ? <Timeline inbox contexts={workspace.contexts} token={session?.token} onChanged={loadWorkspace} /> : activePage === 'Timeline' ? <Timeline eventId={new URLSearchParams(window.location.search).get('event')} contexts={workspace.contexts} token={session?.token} onChanged={loadWorkspace} /> : activePage === 'Insights' ? <Insights token={session?.token} /> : activePage === 'Connectors' ? <Connectors connectors={workspace.connectors} token={session?.token} onChanged={loadWorkspace} /> : activePage === 'Settings' ? <Settings onLogout={handleLogout} onUserUpdated={handleUserUpdated} user={session?.user} settings={workspace.settings} connectors={workspace.connectors} token={session?.token} onChanged={loadWorkspace} /> : activePage === 'Admin' && isAdmin ? <AdminPortal token={session?.token} currentUser={session?.user} /> : <ComingSoon title={activePage} />)}
        </section></ErrorBoundary>
      </div>
    </main>
  );
}


createRoot(document.getElementById('root')).render(<StrictMode><ErrorBoundary><App /></ErrorBoundary></StrictMode>);
