import { useState } from 'react';
import { requestApi } from '../lib/api.js';
export default function ActivityReview({ event, contexts, token, onChanged, onUndo, disabled = false }) {
  const [contextId, setContextId] = useState(event.contextId || '');
  const [name, setName] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const review = async action => {
    setBusy(true); setError('');
    try {
      const result = await requestApi(`/api/events/${event.id}`, { token, method: 'PATCH', body: { action, contextId: contextId === 'new' ? null : contextId || null, ...(contextId === 'new' ? { createName: name } : {}) } });
      onUndo?.({ eventId: event.id, token: result.undoToken });
      await onChanged();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <article className={`review-activity ${event.type === 'dismissed' ? 'dismissed' : ''}`}>
    <div className="review-top"><span className={`activity-source ${event.source}`}>{event.source}</span><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></div>
    <h3>{event.title}</h3><p>{event.detail}</p>
    <div className="review-meta"><span>{event.type === 'dismissed' ? 'Dismissed' : contexts.find(x => x.id === event.contextId)?.name || 'Unassigned activity'}</span>{event.href && <a href={event.href} target="_blank" rel="noopener noreferrer">Open resource ↗</a>}<button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>Why is this here?</button></div>
    {expanded && <div className="review-explanation"><p>{event.explanation?.method === 'manual' ? 'Your assignment' : 'Matching evidence'}</p><ul>{(event.explanation?.reasons?.length ? event.explanation.reasons : ['No matching explanation was recorded for this older activity. You can review its assignment below.']).map((reason, index) => <li key={index}>{reason}</li>)}</ul></div>}
    <div className="review-controls"><label>Assign to<select value={contextId} onChange={e => setContextId(e.target.value)} disabled={busy || disabled}><option value="">Unassigned</option>{contexts.map(context => <option key={context.id} value={context.id}>{context.name}</option>)}<option value="new">Create a context…</option></select></label>{contextId === 'new' && <label>Context name<input maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Name this work" /></label>}<button type="button" disabled={busy || disabled || (contextId === 'new' && !name.trim())} onClick={() => review('assign')}>{busy ? 'Saving…' : 'Save assignment'}</button>{event.type !== 'dismissed' && <button type="button" disabled={busy || disabled} onClick={() => review('dismiss')}>Dismiss</button>}</div>
    {error && <p role="alert" className="inline-error">{error}</p>}
  </article>;
}
