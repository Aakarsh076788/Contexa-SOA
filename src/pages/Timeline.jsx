import { useEffect, useRef, useState } from 'react';
import ActivityReview from '../components/ActivityReview.jsx';
import { requestApi } from '../lib/api.js';

export default function Timeline({ contexts, token, onChanged, inbox = false, eventId }) {
  const [source, setSource] = useState('All');
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('');
  const [showDismissed, setShowDismissed] = useState(false);
  const [records, setRecords] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState([]);
  const [batchContext, setBatchContext] = useState('');
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [error, setError] = useState('');
  const generation = useRef(0);
  const currentQuery = useRef('');

  useEffect(() => {
    const controller = new AbortController();
    const revision = ++generation.current;
    const params = new URLSearchParams({ limit: '50' });
    if (inbox) params.set('inbox', 'true');
    if (source !== 'All') params.set('source', source);
    if (query.trim()) params.set('q', query.trim());
    if (showDismissed) params.set('includeDismissed', 'true');
    if (eventId) params.set('eventId', eventId);
    if (date) {
      const from = new Date(`${date}T00:00:00`);
      const to = new Date(from); to.setDate(to.getDate() + 1);
      if (!Number.isNaN(from.valueOf())) { params.set('from', from.toISOString()); params.set('to', to.toISOString()); }
    }
    currentQuery.current = params.toString();
    setLoading(true); setError(''); setSelected([]); setLoadingMore(false);
    const timer = setTimeout(() => {
      requestApi(`/api/events?${params}`, { token, signal: controller.signal }).then(data => {
        if (generation.current !== revision) return;
        setRecords(data.events); setNextCursor(data.nextCursor); setTotal(data.total);
      }).catch(err => { if (err.name !== 'AbortError' && generation.current === revision) setError(err.message); })
        .finally(() => { if (generation.current === revision) setLoading(false); });
    }, query ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [token, source, query, date, inbox, showDismissed, eventId, reload]);

  const changed = async () => { await onChanged(); setReload(current => current + 1); };
  const loadMore = async () => {
    const revision = generation.current;
    setLoadingMore(true); setError('');
    try {
      const data = await requestApi(`/api/events?${currentQuery.current}&cursor=${encodeURIComponent(nextCursor)}`, { token });
      if (revision !== generation.current) return;
      setRecords(current => [...current, ...data.events.filter(item => !current.some(old => old.id === item.id))]);
      setNextCursor(data.nextCursor); setTotal(data.total);
    } catch (err) { if (revision === generation.current) setError(err.message); }
    finally { if (revision === generation.current) setLoadingMore(false); }
  };
  const undoLast = async () => {
    try { await requestApi(`/api/events/${undo.eventId}`, { token, method: 'PATCH', body: { action: 'undo', undoToken: undo.token } }); setUndo(null); setNotice('Last activity change undone.'); await changed(); }
    catch (err) { setError(err.message); }
  };
  const batchReview = async action => {
    setBusy(true); setError(''); setActionError(''); setNotice(''); let completed = 0;
    try {
      for (const id of selected) {
        const data = await requestApi(`/api/events/${id}`, { token, method: 'PATCH', body: { action, ...(action === 'assign' ? { contextId: batchContext } : {}) } });
        setUndo({ eventId: id, token: data.undoToken }); completed++;
      }
      setNotice(`${completed} ${completed === 1 ? 'activity' : 'activities'} ${action === 'dismiss' ? 'dismissed' : 'assigned'}.`);
    } catch (err) { setActionError(`${completed} updated. ${err.message} Remaining activities have not been changed.`); }
    finally { setSelected([]); await changed(); setBusy(false); }
  };
  const toggle = id => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);

  return <div className="timeline-page">
    <section className="timeline-intro"><div><p className="eyebrow">{inbox ? 'REVIEW YOUR SIGNALS' : 'YOUR WORK, IN MOTION'}</p><h1>{inbox ? 'Activity inbox' : 'Timeline'}</h1><p className="description">{inbox ? 'Give unassigned activity a home, or dismiss what you don’t need.' : 'Your captured work, with the evidence behind each connection.'}</p></div><span className="stat-pill">{loading ? 'Loading…' : `${total} ${total === 1 ? 'activity' : 'activities'}`}</span></section>
    <section className="timeline-toolbar" aria-label="Activity filters">
      <label className="context-search"><span aria-hidden="true">⌕</span><input aria-label="Search activity" placeholder="Search activity" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <label>Source<select value={source} onChange={e => setSource(e.target.value)}><option>All</option>{['chrome', 'vscode', 'discord', 'telegram', 'github'].map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      {!inbox && <label className="checkbox-label"><input type="checkbox" checked={showDismissed} onChange={e => setShowDismissed(e.target.checked)} />Show dismissed</label>}
      <button type="button" disabled={busy || loading} onClick={() => setReload(current => current + 1)}>Refresh</button>
      {(date || query || source !== 'All' || eventId) && <button type="button" onClick={() => { setDate(''); setQuery(''); setSource('All'); if (eventId) { window.history.replaceState({}, '', '/timeline'); window.dispatchEvent(new PopStateEvent('popstate')); } }}>Clear filters</button>}
    </section>
    {inbox && records.length > 0 && !loading && <div className="batch-review-bar">
      <label className="checkbox-label"><input type="checkbox" disabled={busy} checked={records.every(item => selected.includes(item.id))} onChange={e => setSelected(e.target.checked ? records.map(item => item.id) : [])} />Select loaded activities</label>
      {selected.length > 0 && <><span>{selected.length} selected</span><label className="sr-only" htmlFor="batch-context">Assign selected activities to</label><select id="batch-context" disabled={busy} value={batchContext} onChange={e => setBatchContext(e.target.value)}><option value="">Choose context…</option>{contexts.map(context => <option key={context.id} value={context.id}>{context.name}</option>)}</select><button type="button" disabled={busy || !batchContext} onClick={() => batchReview('assign')}>Assign selected</button><button type="button" disabled={busy} onClick={() => batchReview('dismiss')}>{busy ? 'Updating…' : 'Dismiss selected'}</button></>}
    </div>}
    {actionError && <p className="settings-notice" role="alert">{actionError}</p>}
    {notice && <p className="settings-notice" role="status">{notice}</p>}
    {undo && <div className="settings-notice" role="status">Activity updated.<button disabled={busy} onClick={undoLast}>Undo last activity change</button></div>}
    {error && <p className="settings-notice" role="alert">{error}<button onClick={() => setReload(current => current + 1)}>Retry</button></p>}
    {loading ? <div className="loading-state" role="status">Loading activities…</div> : <div className="review-list">{records.map(event => <div className="review-row" key={`${event.id}-${event.contextId}-${event.type}`}>{inbox && <label className="activity-selection"><input type="checkbox" disabled={busy} checked={selected.includes(event.id)} onChange={() => toggle(event.id)} /><span className="sr-only">Select {event.title}</span></label>}<ActivityReview disabled={busy} event={event} contexts={contexts} token={token} onChanged={changed} onUndo={setUndo} /></div>)}</div>}
    {!loading && nextCursor && <div className="timeline-pagination"><p className="muted">{records.length} of {total} activities loaded</p><button type="button" disabled={loadingMore || busy} onClick={loadMore}>{loadingMore ? 'Loading…' : 'Load more activities'}</button></div>}
    {!loading && !error && !records.length && <div className="empty-contexts"><h2>{inbox && !query && !date && source === 'All' ? 'You’re all caught up' : 'No matching activity'}</h2><p>{inbox ? 'New signals that need review will appear here. Adjust filters to check other activity.' : 'Connect a tool or adjust the filters to see your work.'}</p></div>}
  </div>;
}
