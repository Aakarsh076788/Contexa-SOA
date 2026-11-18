import { useState, useEffect } from 'react';
import { requestApi, downloadJson, evidenceLabel } from '../lib/api.js';
import { Evidence, SummaryPanel, ReplayPanel, DiffPanel } from '../components/ui.jsx';
import GraphPanel from '../components/GraphPanel.jsx';
import ActivityReview from '../components/ActivityReview.jsx';

export default function ContextDetails({ contextId, token, onChanged, onBack, contexts = [] }) {
  const [detail, setDetail] = useState(null);
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [difference, setDifference] = useState(null);
  const [restorePlan, setRestorePlan] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [generatedPrompt, setGeneratedPrompt] = useState(null);
  const [undo, setUndo] = useState(null);
  const [templateType, setTemplateType] = useState('continue');
  const [branchId, setBranchId] = useState('');

  const load = async (signal) => { const data = await requestApi(`/api/contexts/${encodeURIComponent(contextId)}`, { token, signal }); setDetail(data); setNote(data.sessionNote); };
  useEffect(() => { const controller = new AbortController(); load(controller.signal).catch(error => { if (error.name !== 'AbortError') setNotice(error.message); }); return () => controller.abort(); }, [contextId, token]);
  const execute = async (action, body, success) => { setBusy(true); try { const data = await requestApi(`/api/contexts/${contextId}/${action}`, { token, method: 'POST', body }); setNotice(success(data)); await load(); await onChanged(); } catch (error) { setNotice(error.message); } finally { setBusy(false); } };
  const saveNote = async () => { setBusy(true); try { await requestApi(`/api/contexts/${contextId}/note`, { token, method: 'PUT', body: { note } }); setNotice('Session note saved.'); setDetail(current => ({ ...current, sessionNote: note })); await onChanged(); } catch (error) { setNotice(error.message); } finally { setBusy(false); } };
  const compareLatest = async () => { const ordered = detail.versions.slice().sort((a, b) => b.number - a.number); if (ordered.length < 2) return setNotice('Create one more context version before comparing.'); try { setDifference(await requestApi(`/api/contexts/${contextId}/diff?from=${ordered[1].number}&to=${ordered[0].number}`, { token })); } catch (error) { setNotice(error.message); } };
  const prepareRestore = async () => { if (!detail.versions.length) { setNotice('Create a checkpoint in Versions before preparing a restore.'); return; } setBusy(true); try { const data = await requestApi(`/api/contexts/${contextId}/restore`, { token, method: 'POST', body: { versionNumber: detail.versions[0]?.number } }); setRestorePlan(data); setNotice('Restore plan prepared. Open only the resources you want to revisit.'); } catch (error) { setNotice(error.message); } finally { setBusy(false); } };
  const createHandoff = async () => { setBusy(true); try { const data = await requestApi(`/api/contexts/${contextId}/handoff`, { token, method: 'POST', body: { recipient: 'Teammate', note } }); downloadJson(`contexa-${detail.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-handoff.json`, data.package); setNotice('Context handoff package downloaded.'); await load(); await onChanged(); } catch (error) { setNotice(error.message); } finally { setBusy(false); } };
  const generatePrompt = async () => { setBusy(true); try { const data = await requestApi(`/api/contexts/${contextId}/generate-prompt`, { token, method: 'POST', body: { templateType } }); setGeneratedPrompt(data); } catch (error) { setNotice(error.message); } finally { setBusy(false); } };
  const copyPrompt = async () => { if (!generatedPrompt?.prompt) return; try { await navigator.clipboard.writeText(generatedPrompt.prompt); setNotice('Prompt copied. Paste it into your preferred AI tool.'); } catch { setNotice('Clipboard access is unavailable. Select and copy the prompt text, or download it.'); } };
  if (!detail) return <div className="loading-state" role={notice ? 'alert' : 'status'}>{notice || 'Loading context…'}{notice && <div className="resume-actions"><button onClick={() => { setNotice(''); load().catch(err => setNotice(err.message)); }}>Retry</button><button onClick={onBack}>All contexts</button></div>}</div>;
  
  return (
    <div className="details-page">
      <div className="details-topline">
        <button className="back-link" type="button" onClick={onBack}><span aria-hidden="true">←</span> All contexts</button>
      </div>

      <section className="details-hero">
        <div className="details-heading"><p className="eyebrow">{detail.state} <span className="active-dot" /></p><h1>{detail.name} <em>— {detail.topic}</em></h1><p>{detail.description}</p></div>
        <div className="context-health"><span>CONTEXT HEALTH</span><strong>{evidenceLabel(detail.confidence)} <i /></strong><p>{detail.sources.length} sources connected</p></div>
      </section>

      {generatedPrompt && (
        <section className="prompt-generator-panel">
          <div className="prompt-panel-header">
            <div className="prompt-header-title">
              <span className="prompt-badge">✨ PROMPT GENERATOR</span>
              <h3>Your context as an LLM prompt</h3>
              <p>This prompt summarizes your recorded work context — <strong>{generatedPrompt.stats.events} activities</strong>, <strong>{generatedPrompt.stats.entities} entities</strong>, <strong>{generatedPrompt.stats.sources} sources</strong>. Copy and paste it into any LLM.</p>
            </div>
            <button type="button" className="prompt-close-btn" onClick={() => setGeneratedPrompt(null)} title="Close">✕</button>
          </div>

          <div className="prompt-code-wrapper">
            <textarea
              className="prompt-textarea"
              readOnly
              value={generatedPrompt.prompt}
              onClick={(e) => e.target.select()}
            />
          </div>

          <div className="prompt-footer-actions">
            <button
              type="button"
              className="prompt-download-btn"
              onClick={() => {
                const blob = new Blob([generatedPrompt.prompt], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `contexa-prompt-${detail.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
                a.click();
                URL.revokeObjectURL(url);
                setNotice('Prompt downloaded as markdown file.');
              }}
            >
              📥 Download as .md
            </button>
            <button type="button" className="prompt-copy-btn" onClick={copyPrompt}>
              📋 Copy to clipboard
            </button>
          </div>
        </section>
      )}

      {restorePlan && (
        <section className="prompt-generator-panel restore-panel-custom">
          <div className="prompt-panel-header">
            <div className="prompt-header-title">
              <span className="prompt-badge" style={{ color: '#86efac' }}>🚀 RESTORE PLAN · v{restorePlan.version.number}</span>
              <h3>Choose what to reopen</h3>
              <p>Contexa never opens work silently. Review each resource and open only what you approve.</p>
            </div>
            <button type="button" className="prompt-close-btn" onClick={() => setRestorePlan(null)} title="Close">✕</button>
          </div>
          <div className="restore-resources-grid">
            {restorePlan.restorePlan.map((resource) => (
              <article key={`${resource.source}-${resource.label}`} className="restore-item">
                <span className={`connected-icon ${resource.source}`} />
                <div className="restore-item-info">
                  <strong>{resource.label}</strong>
                  <small>{resource.message}</small>
                </div>
                {resource.href ? (
                  <button type="button" className="restore-open-btn" onClick={() => window.open(resource.href, '_blank', 'noopener,noreferrer')}>
                    Open resource ↗
                  </button>
                ) : (
                  <em className="restore-offline-tag">Open in {resource.sourceNames ?? resource.source}</em>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <nav className="context-tabs" aria-label="Context detail sections">{[['overview', 'Overview'], ['activity', 'Activity'], ['graph', 'Context graph'], ['versioning', 'Versions']].map(([id, label]) => <button key={id} type="button" className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}>{label}</button>)}</nav>

      {activeTab === 'overview' && <div className="detail-tab overview-tab">
        <div><SummaryPanel summary={detail.summary} /><button type="button" disabled={busy} onClick={async () => { setBusy(true); try { const summary = await requestApi(`/api/contexts/${contextId}/summarize`, { token, method: 'POST' }); setDetail(current => ({ ...current, summary })); setNotice(summary.status === 'AI_SUCCESS' ? 'Cloud summary generated.' : 'Local summary generated.'); } catch (err) { setNotice(err.message); } finally { setBusy(false); } }}>Refresh summary</button></div>
        <div className="details-grid">
          <section className="evidence-panel"><div className="panel-heading"><div><p className="eyebrow">CONNECTED EVIDENCE</p><h2>What you worked with</h2></div><span>{detail.entities.length} entities</span></div><div className="evidence-list">{detail.entities.map((item) => <Evidence key={item.id} type={item.source} label={item.type} title={item.label} meta={item.metadata?.project || item.source} />)}</div></section>
          <aside className="resume-panel primary-focus"><div className="panel-heading"><div><p className="eyebrow">PICK UP FROM HERE</p><h2>Session note</h2></div><span className="note-live">{busy ? 'Saving…' : 'Private'}</span></div><textarea aria-label="Session note" value={note} onChange={(event) => setNote(event.target.value)} /><button type="button" disabled={busy || note === detail.sessionNote} onClick={saveNote}>Save session note</button><div className="next-step"><span aria-hidden="true">→</span><div><p className="eyebrow">SUGGESTED NEXT STEP</p><strong>{detail.nextAction}</strong></div></div><label>Prompt type<select value={templateType} onChange={e => setTemplateType(e.target.value)}>{['continue', 'debug', 'review', 'comprehensive'].map(x => <option key={x}>{x}</option>)}</select></label><button className="resume-large" type="button" disabled={busy} onClick={generatePrompt}>Generate prompt <span aria-hidden="true">✦</span></button><button className="resume-large" type="button" disabled={busy} onClick={prepareRestore} style={{ marginTop: '0.5rem' }}>Prepare restore <span aria-hidden="true">↗</span></button></aside>
        </div>
      </div>}
      {activeTab === 'activity' && <div className="detail-tab activity-tab"><h2>Activity and matching evidence</h2>{undo && <div className="settings-notice" role="status">Assignment updated.<button onClick={async () => { try { await requestApi(`/api/events/${undo.eventId}`, { token, method: 'PATCH', body: { action: 'undo', undoToken: undo.token } }); setUndo(null); await load(); await onChanged(); } catch (err) { setNotice(err.message); } }}>Undo</button></div>}{detail.events.map(item => <ActivityReview key={item.id} event={item} contexts={contexts.length ? contexts : [detail]} token={token} onChanged={async () => { await load(); await onChanged(); }} onUndo={setUndo} />)}<ReplayPanel events={detail.events.slice().reverse()} /></div>}
      {activeTab === 'graph' && <div className="detail-tab graph-tab"><section className="explanation-strip"><span className="explanation-icon" aria-hidden="true">✦</span><div><p className="eyebrow">WHY THIS IS ONE CONTEXT</p><p>Contexa linked <strong>{detail.entities.length} entities</strong> through shared projects, keywords, sources, and timing. Every graph connection keeps its reason.</p></div><span className="confidence">{evidenceLabel(detail.confidence)}</span></section><GraphPanel entities={detail.entities} relationships={detail.relationships} /></div>}
      {activeTab === 'versioning' && <section className="detail-tab version-workbench"><div><p className="eyebrow">CONTEXT VERSIONING</p><h2>Versions, branches, and handoff</h2><p>Version the evolving work context—not a duplicate copy of raw activity.</p></div><label>Checkpoint branch<select value={branchId} onChange={e => setBranchId(e.target.value)}><option value="">Main</option>{detail.branches.filter(x => x.status === 'active').map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><div className="version-actions"><button type="button" disabled={busy} onClick={() => execute('versions', { label: detail.state, summary: note || detail.nextAction, branchId: branchId || null }, (data) => `Context version v${data.number} created.`)}>Create version</button><button type="button" disabled={busy} onClick={compareLatest}>Compare latest</button><button type="button" disabled={busy} onClick={() => { const name = window.prompt('Name this experiment branch'); if (name) execute('branches', { name }, (data) => `Branch “${data.name}” created from v${data.baseVersion}.`); }}>New branch</button><button type="button" disabled={busy} onClick={createHandoff}>Export handoff</button></div><div className="version-list">{detail.versions.map((item) => <article key={item.id}><span>v{item.number}</span><div><strong>{item.label}</strong><p>{item.summary}</p></div><small>{item.state}</small></article>)}</div>{detail.branches.map(branch => <div className="branch-line" key={branch.id}><span>{branch.name} · {branch.status} · base v{branch.baseVersion}</span>{branch.status === 'active' && <button disabled={busy} onClick={() => execute(`branches/${branch.id}/merge`, {}, () => { setBranchId(''); return 'Branch merged into a new main checkpoint.'; })}>Merge branch</button>}</div>)}{difference && <DiffPanel difference={difference} />}</section>}

      {notice && <p className="context-notice" role="status">{notice}</p>}
    </div>
  );
}
