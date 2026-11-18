import { useState } from 'react';

export function Evidence({ type, label, title, meta, code }) {
  return <article className="evidence-row"><span className={`evidence-app ${type}`} aria-hidden="true" /> <div><p>{label}</p><h3>{code ? <code>{title}</code> : title}</h3><span>{meta}</span></div></article>;
}
export function SummaryPanel({ summary }) {
  if (!summary) return null;
  return (
    <section className="summary-panel">
      <div className="summary-mark" aria-hidden="true">✦</div>
      <div>
        <p className="eyebrow">{summary.status === 'AI_SUCCESS' ? 'AI CONTEXT SUMMARY' : 'LOCAL CONTEXT SUMMARY'}</p>
        <h2>{summary.headline}</h2>
        <p>{summary.narrative}</p>
        
        {summary.errors && summary.errors.length > 0 && (
          <div className="summary-errors">
            <h3><span aria-hidden="true">⚠️</span> Detected Issues</h3>
            <ul>
              {summary.errors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          </div>
        )}

        {summary.leads && summary.leads.length > 0 && (
          <div className="summary-leads">
            <h3><span aria-hidden="true">🔍</span> Open Leads</h3>
            <ul>
              {summary.leads.map((lead, i) => <li key={i}>{lead}</li>)}
            </ul>
          </div>
        )}

        <div className="summary-details">
          <span><small>Evidence</small>{summary.evidence || (summary.status === 'AI_SUCCESS' ? 'Cloud AI analysis' : 'Captured activity counts')}</span>
          <span><small>In progress</small>{summary.inProgress || 'IMPLEMENTATION'}</span>
          <span><small>Next action</small>{summary.nextAction}</span>
        </div>
      </div>
    </section>
  );
}
export function ReplayPanel({ events }) {
  const [position, setPosition] = useState(Math.max(0, events.length - 1));
  const selected = events[position];
  if (!selected) return null;
  return <section className="replay-panel"><div className="panel-heading"><div><p className="eyebrow">CONTEXT REPLAY</p><h2>Revisit the work trail</h2></div><span>Read-only</span></div><p>Move through the accepted signals in order. Replay explains what happened; restoring a version still requires your confirmation.</p><input type="range" min="0" max={Math.max(0, events.length - 1)} value={position} onChange={(event) => setPosition(Number(event.target.value))} aria-label="Choose a point in the context replay" /><div className="replay-selected"><span className={`timeline-node ${selected.source}`} /><div><small>{position + 1} of {events.length} · {selected.day}, {selected.time}</small><strong>{selected.title}</strong><p>{selected.detail || 'Captured activity'}</p></div><em>{selected.kind}</em></div></section>;
}
export function DiffPanel({ difference }) {
  return <div className="diff-panel"><p className="eyebrow">CONTEXT DIFF · v{difference.from.number} → v{difference.to.number}</p>{difference.stateChanged && <p className="diff-state">State: {difference.stateChanged}</p>}<div>{[['Added', difference.added, '+'], ['Changed', difference.changed, '~'], ['Removed', difference.removed, '−']].map(([label, entries, mark]) => <section key={label}><strong>{label}</strong>{entries.length ? entries.map((entry) => <p key={entry}><i>{mark}</i>{entry}</p>) : <p>None</p>}</section>)}</div></div>;
}
export function SettingLine({ title, description, children }) {
  return <div className="setting-line"><div><strong>{title}</strong><p>{description}</p></div>{children}</div>;
}
export function Switch({ checked, onChange, label }) {
  return <button type="button" className={`toggle-switch ${checked ? 'on' : ''}`} onClick={onChange} role="switch" aria-checked={checked} aria-label={label}><i /></button>;
}
export function AppLogo({ id, color = '#ffffff', size = 28 }) {
  if (id === 'chrome') {
    return <svg viewBox="0 0 24 24" width={size} height={size}><path fill="#EA4335" d="M12 2C6.48 2 2 6.48 2 12c0 1.25.23 2.45.65 3.56L7.5 7.5h8.94C15.15 4.14 12 2 12 2z"/><path fill="#4285F4" d="M12 22c4.14 0 7.64-2.52 9.1-6.14l-5.6-9.7H7.5l-4.85 8.28C4.54 18.27 7.97 22 12 22z"/><path fill="#FBBC05" d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/><path fill="#34A853" d="M2.65 15.56A10 10 0 0 0 12 22l4.6-7.86H7.5L2.65 15.56z"/></svg>;
  }
  if (id === 'vscode') {
    return <svg viewBox="0 0 24 24" width={size} height={size} fill="#007ACC"><path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.276A1 1 0 0 0 .324 8.71L4.16 12 .324 15.29a1 1 0 0 0 .003 1.433l1.322 1.218a1 1 0 0 0 1.276.056l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zM18.5 16.5l-6.42-4.5 6.42-4.5v9z"/></svg>;
  }
  if (id === 'github') {
    return <svg viewBox="0 0 24 24" width={size} height={size} fill="#FFFFFF"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>;
  }
  if (id === 'discord') {
    return <svg viewBox="0 0 24 24" width={size} height={size} fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>;
  }
  if (id === 'telegram') {
    return <svg viewBox="0 0 24 24" width={size} height={size} fill="#229ED9"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18.847-1.109 4.887-1.577 7.021-.198.904-.53 1.207-.852 1.236-.7.064-1.233-.464-1.912-.909-1.063-.697-1.663-1.131-2.696-1.811-1.194-.787-.42-1.22.261-1.927.178-.184 3.27-2.998 3.33-3.253.008-.032.015-.15-.056-.213-.07-.064-.175-.042-.25-.025-.107.024-1.811 1.152-5.113 3.379-.484.333-.923.496-1.317.487-.433-.01-1.267-.245-1.887-.446-.76-.247-1.365-.378-1.312-.798.028-.219.328-.444.901-.676 3.535-1.539 5.894-2.553 7.078-3.044 3.371-1.401 4.072-1.644 4.529-1.652.1 0 .324.024.47.142.123.099.157.234.173.328.016.094.037.311.021.48z"/></svg>;
  }
  if (id === 'terminal') {
    return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>;
  }
  if (id === 'slack') {
    return <svg viewBox="0 0 24 24" width={size} height={size}><path fill="#E01E5A" d="M5.04 14.28a2.52 2.52 0 1 0-2.52-2.52v2.52h2.52z"/><path fill="#E01E5A" d="M6.3 14.28a2.52 2.52 0 0 0 5.04 0v-6.3a2.52 2.52 0 1 0-5.04 0v6.3z"/><path fill="#36C5F0" d="M9.72 5.04a2.52 2.52 0 1 0-2.52-2.52h2.52v2.52z"/><path fill="#36C5F0" d="M9.72 6.3a2.52 2.52 0 0 0 0 5.04h6.3a2.52 2.52 0 1 0 0-5.04h-6.3z"/><path fill="#2EB67D" d="M18.96 9.72a2.52 2.52 0 1 0 2.52 2.52v-2.52h-2.52z"/><path fill="#2EB67D" d="M17.7 9.72a2.52 2.52 0 0 0-5.04 0v6.3a2.52 2.52 0 1 0 5.04 0v-6.3z"/><path fill="#ECB22E" d="M14.28 18.96a2.52 2.52 0 1 0 2.52 2.52v-2.52h-2.52z"/><path fill="#ECB22E" d="M14.28 17.7a2.52 2.52 0 0 0 0-5.04h-6.3a2.52 2.52 0 1 0 0 5.04h6.3z"/></svg>;
  }
  if (id === 'jira') {
    return <svg viewBox="0 0 24 24" width={size} height={size}><path fill="#0052CC" d="M11.53 2c0 5.26-4.27 9.53-9.53 9.53v.94c5.26 0 9.53 4.27 9.53 9.53h.94c0-5.26 4.27-9.53 9.53-9.53v-.94c-5.26 0-9.53-4.27-9.53-9.53h-.94z"/></svg>;
  }
  if (id === 'linear') {
    return <svg viewBox="0 0 24 24" width={size} height={size} fill="#5E6AD2"><path d="M2.5 12a9.5 9.5 0 0 1 18.06-4.21l-13.85 13.85A9.5 9.5 0 0 1 2.5 12zm1.94 4.21l13.85-13.85A9.5 9.5 0 0 1 21.5 12a9.5 9.5 0 0 1-17.06 4.21z"/></svg>;
  }
  if (id === 'notion') {
    return <svg viewBox="0 0 24 24" width={size} height={size} fill="#FFFFFF"><path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.093-.373L17.893 2.11c-.466-.373-1.12-.7-2.333-.606L2.965 2.483c-.42.047-.513.327-.326.56l1.82 1.165zm-.28 2.613v13.903c0 .7.373.933 1.166.886l14.475-.84c.793-.047.886-.466.886-.98V5.887c0-.513-.233-.793-.746-.746l-15.035.886c-.513.047-.746.327-.746.794zm13.727 1.073c.093.42 0 .84-.42.886l-.84.14v9.613c-.373.233-.793.373-1.166.373-.653 0-.933-.233-1.493-.933l-5.04-7.886v7.327l1.4.326s0 .747-.98.747l-2.8-.047s-.047-.28.373-.373l.933-.233V8.874l-1.306-.14s0-.653.886-.7l3.266-.187 5.226 8.073V8.874l-1.26-.14s0-.653.886-.7l2.8-.187z"/></svg>;
  }
  if (id === 'figma') {
    return <svg viewBox="0 0 24 24" width={size} height={size}><path fill="#F24E1E" d="M8 2h4v8H8a4 4 0 1 1 0-8z"/><path fill="#FF7262" d="M12 2h4a4 4 0 1 1 0 8h-4V2z"/><path fill="#1ABCFE" d="M16 10a4 4 0 1 1 0 8h-4v-8h4z"/><path fill="#0ACF83" d="M8 18a4 4 0 1 1 4-4v4a4 4 0 0 1-4 4z"/><path fill="#A259FF" d="M8 10h4v4H8a4 4 0 1 1 0-4z"/></svg>;
  }
  return <span className={`connected-icon ${id}`} aria-hidden="true" />;
}
export function Activity({ time, app, title, source }) {
  return <article className="activity-item"><time>{time}</time><span className={`app-mark ${app}`} aria-hidden="true" /><p>{title} <span>· {source}</span></p></article>;
}
export function ComingSoon({ title }) {
  return <section className="placeholder"><span>✦</span><h2>{title} is ready to design next.</h2><p>For now, this placeholder confirms the shared navigation works across every Contexa section.</p></section>;
}