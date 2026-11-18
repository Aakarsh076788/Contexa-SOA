import { useEffect, useRef, useState } from 'react';
import { requestApi } from '../lib/api.js';

export default function WorkspaceSearch({ token, onOpenContext, onTimeline }) {
  const input = useRef(null);
  const container = useRef(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const clear = () => { setQuery(''); setResults(null); setError(''); };
  useEffect(() => {
    const focus = event => {
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.target.isContentEditable && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) { event.preventDefault(); input.current?.focus(); }
      if (event.key === 'Escape' && container.current?.contains(document.activeElement)) { clear(); input.current?.focus(); }
    };
    const dismiss = event => { if (!container.current?.contains(event.target)) clear(); };
    document.addEventListener('keydown', focus);
    document.addEventListener('pointerdown', dismiss);
    return () => { document.removeEventListener('keydown', focus); document.removeEventListener('pointerdown', dismiss); };
  }, []);
  useEffect(() => {
    if (query.trim().length < 2) { setResults(null); setError(''); setLoading(false); return; }
    const controller = new AbortController();
    setResults(null); setLoading(true);
    const timer = setTimeout(() => requestApi(`/api/search?q=${encodeURIComponent(query.trim())}`, { token, signal: controller.signal })
      .then(data => { setResults(data); setError(''); })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); }), 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, token]);
  const choose = callback => { callback(); clear(); };
  return <div className="workspace-search" ref={container}>
    <label><svg className="workspace-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><span className="sr-only">Search workspace</span><input ref={input} autoComplete="off" placeholder="Search your workspace…" value={query} onChange={e => setQuery(e.target.value)} /><kbd aria-hidden="true">/</kbd></label>
    {(results || loading || error) && <section className="workspace-search-results" aria-label="Workspace search results" aria-busy={loading}>
      <button onClick={() => { clear(); input.current?.focus(); }} aria-label="Close search results">Close ×</button>
      {loading && <p role="status">Searching…</p>}{error && <p role="alert">{error}</p>}
      {results?.contexts?.map(item => <button key={`context-${item.id}`} onClick={() => choose(() => onOpenContext(item.id))}><strong>{item.name}</strong><span>Context · {item.topic}</span></button>)}
      {results?.entities?.map(item => <button key={`entity-${item.id}`} onClick={() => choose(() => item.contextId ? onOpenContext(item.contextId) : onTimeline())}><strong>{item.label}</strong><span>Resource · {item.source} · {item.type}</span></button>)}
      {results?.events?.map(item => <button key={`event-${item.id}`} onClick={() => choose(() => item.contextId ? onOpenContext(item.contextId) : onTimeline(item.id))}><strong>{item.title}</strong><span>{item.source} activity</span></button>)}
      {results && ![...(results.contexts || []), ...(results.entities || []), ...(results.events || [])].length && <p>No matching contexts, resources, or activity.</p>}
    </section>}
  </div>;
}
