import { useState } from 'react';
import { requestApi, evidenceLabel } from '../lib/api.js';
export default function Contexts({ contexts, token, onChanged, onOpenContext }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [selected, setSelected] = useState(contexts[0]?.id);
  const [creating, setCreating] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ name: '', topic: '' });
  const [error, setError] = useState('');
  const [sort, setSort] = useState('Recent');

  const visibleContexts = contexts.filter((item) => {
    const matchesQuery = `${item.name} ${item.topic} ${item.sessionNote} ${item.state}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === 'All' || (filter === 'Active' && !['COMPLETED', 'ARCHIVED'].includes(item.state)) || (filter === 'Recent' && item.updatedAt);
    return matchesQuery && matchesFilter;
  }).sort((a, b) => sort === 'Recent' ? new Date(b.updatedAt) - new Date(a.updatedAt) : sort === 'Name' ? a.name.localeCompare(b.name) : b.confidence - a.confidence);

  const createContext = async (event) => {
    event.preventDefault(); setError('');
    try { const item = await requestApi('/api/contexts', { token, method: 'POST', body: draft }); await onChanged(); onOpenContext(item.id); }
    catch (requestError) { setError(requestError.message); }
  };

  const toggleSelection = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === visibleContexts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleContexts.map(c => c.id)));
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!window.confirm(`Are you sure you want to delete ${count} selected context${count > 1 ? 's' : ''}? Their activity will remain safely in the Timeline.`)) return;
    
    setBusy(true); setError('');
    try {
      await requestApi('/api/contexts/batch-delete', {
        token,
        method: 'POST',
        body: { contextIds: Array.from(selectedIds) }
      });
      setSelectedIds(new Set());
      setSelectMode(false);
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const mergeSelected = async () => {
    if (selectedIds.size < 2) return setError('Select at least two contexts to merge.');
    setBusy(true); setError('');
    try {
      await requestApi('/api/contexts/merge', { token, method: 'POST', body: { contextIds: Array.from(selectedIds) } });
      setSelectMode(false);
      setSelectedIds(new Set());
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="contexts-page">
      <section className="contexts-intro">
        <div>
          <p className="eyebrow">YOUR WORK, CONNECTED</p>
          <h1>Contexts</h1>
          <p className="description">Every work thread, brought together from the apps you use.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {selectMode ? (
            <>
              <button className="new-context" style={{ background: 'rgba(255,255,255,0.06)' }} type="button" onClick={selectAll}>
                {selectedIds.size === visibleContexts.length ? 'Deselect All' : 'Select All'}
              </button>
              <button 
                className="new-context danger-action" 
                style={{ background: 'rgba(248, 113, 113, 0.15)', borderColor: 'rgba(248, 113, 113, 0.35)', color: '#fca5a5' }} 
                type="button" 
                disabled={busy || selectedIds.size === 0} 
                onClick={deleteSelected}
              >
                Delete {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
              </button>
              <button 
                className="new-context" 
                type="button" 
                disabled={busy || selectedIds.size < 2} 
                onClick={mergeSelected}
              >
                Merge {selectedIds.size > 1 ? `(${selectedIds.size})` : ''}
              </button>
              <button className="new-context" style={{ background: 'transparent', borderColor: 'transparent' }} type="button" onClick={() => { setSelectMode(false); setSelectedIds(new Set()); setError(''); }}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button className="new-context" style={{ background: 'rgba(255,255,255,0.06)' }} type="button" onClick={() => { setSelectMode(true); setCreating(false); setError(''); }}>
                Select multiple
              </button>
              <button className="new-context" type="button" onClick={() => { setCreating(true); setSelectMode(false); }}>
                <span aria-hidden="true">+</span> Create context
              </button>
            </>
          )}
        </div>
      </section>

      {creating && <form className="create-context-form" onSubmit={createContext}>
        <div className="create-context-fields">
          <label><span>Context name</span><input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Example: Payment bug" required /></label>
          <label><span>Focus topic <em>optional</em></span><input value={draft.topic} onChange={(event) => setDraft({ ...draft, topic: event.target.value })} placeholder="Example: Refund API" /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="create-context-actions"><button type="button" onClick={() => setCreating(false)}>Cancel</button><button type="submit">Create context</button></div>
      </form>}

      <section className="context-toolbar" aria-label="Context library controls">
        <label className="context-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contexts" aria-label="Search contexts" /></label>
        <div className="filter-tabs" aria-label="Filter contexts">
          {['All', 'Active', 'Recent'].map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={filter === item ? 'selected' : ''}>{item}</button>)}
        </div>
        <label className="sort-control">Sort: <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort contexts"><option value="Recent">Recently active</option><option value="Name">Name</option><option value="Confidence">Confidence</option></select></label>
      </section>

      <section className="context-grid" aria-label="Detected contexts">
        {error && selectMode && <div style={{ color: 'var(--c-red)', padding: '1rem', width: '100%' }}>{error}</div>}
        {visibleContexts.map((item) => (
          <ContextCard 
            key={item.id} 
            item={item} 
            token={token} 
            selected={selectMode ? selectedIds.has(item.id) : selected === item.id} 
            isSelectMode={selectMode}
            onSelect={() => selectMode ? toggleSelection(item.id) : setSelected(item.id)} 
            onOpen={selectMode ? () => toggleSelection(item.id) : onOpenContext} 
            onChanged={onChanged} 
          />
        ))}
        {visibleContexts.length === 0 && <div className="empty-contexts"><span>⌕</span><h2>No matching contexts</h2><p>Try another search or show all of your work threads.</p></div>}
      </section>
    </div>
  );
}
function ContextCard({ item, token, selected, isSelectMode, onSelect, onOpen, onChanged }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const updateState = async (state) => { setBusy(true); try { await requestApi(`/api/contexts/${item.id}`, { token, method: 'PUT', body: { state } }); await onChanged(); setMenuOpen(false); } finally { setBusy(false); } };
  const remove = async () => { if (!window.confirm(`Delete “${item.name}”? Its captured signals will remain in Timeline as unassigned activity.`)) return; setBusy(true); try { await requestApi(`/api/contexts/${item.id}`, { token, method: 'DELETE' }); await onChanged(); setMenuOpen(false); } catch (error) { window.alert(error.message); } finally { setBusy(false); } };
  return (
    <article className={`context-library-card ${item.tint} ${selected ? 'selected' : ''} ${isSelectMode ? 'selectable' : ''}`}>
      <button className="card-select" type="button" onClick={() => { onSelect(); onOpen(item.id); }} aria-label={`Open ${item.name}: ${item.topic}`}>
        {isSelectMode && <div className={`batch-checkbox ${selected ? 'checked' : ''}`}>{selected ? '✓' : ''}</div>}
        <span className="card-status"><i />{item.state}</span>
        <div className="library-card-title"><h2>{item.name}</h2><p>{item.topic}</p></div>
        <p className="library-note">{item.nextAction}</p>
        <div className="library-footer"><div className="source-stack" aria-label={`Connected sources: ${item.sources.join(', ')}`}>{item.sources.map((source) => <span key={source} className={source} />)}</div><span className="time-spent">{evidenceLabel(item.confidence)}</span></div>
      </button>
      {!isSelectMode && <button className="more-control" type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-label={`More options for ${item.name}`}>•••</button>}
      {menuOpen && <div className="context-menu"><button type="button" onClick={() => { onSelect(); onOpen(item.id); }}>Open details</button><button type="button" disabled={busy} onClick={() => updateState(item.state === 'COMPLETED' ? 'DISCOVERY' : 'COMPLETED')}>{item.state === 'COMPLETED' ? 'Reopen context' : 'Mark complete'}</button><button className="danger" type="button" disabled={busy} onClick={remove}>Delete context</button></div>}
    </article>
  );
}
