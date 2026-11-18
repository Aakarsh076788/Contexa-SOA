import { useEffect, useState } from 'react';
import { requestApi } from '../lib/api.js';

export default function Insights({ token }) {
  const [period, setPeriod] = useState('This week');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setReport(null); setError('');
    const params = new URLSearchParams({ period, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
    requestApi(`/api/workspace/insights?${params}`, { token, signal: controller.signal }).then(setReport).catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, [period, token, retry]);
  const max = Math.max(1, ...(report?.days || []).map(item => item.count));
  return <div className="insights-page">
    <section className="insights-intro"><div><p className="eyebrow">OBSERVED WORK PATTERNS</p><h1>Insights</h1><p className="description">Counts from captured activity. Time spent and focus are not measured.</p></div><div className="period-switch">{['This week', 'Last week'].map(item => <button key={item} aria-pressed={period === item} className={period === item ? 'selected' : ''} onClick={() => setPeriod(item)}>{item}</button>)}</div></section>
    {error && <p className="settings-notice" role="alert">{error}<button onClick={() => setRetry(value => value + 1)}>Retry</button></p>}
    {!report && !error && <div className="loading-state" role="status">Loading insights…</div>}
    {report && <><section className="insight-metrics">{[['Captured activities', report.total], ['Work contexts', report.contexts], ['Sources represented', report.sources], ['Observed context changes', report.switches]].map(([label, value]) => <article key={label}><p>{label}</p><strong>{value}</strong><span>Within the selected period</span></article>)}</section>
      <div className="insights-grid"><section className="work-pattern"><h2>Activity by day</h2><div className="bar-chart" role="img" aria-label={report.days.map(item => `${item.label}: ${item.count} activities`).join(', ')}>{report.days.map((day, i) => <div key={i}><span>{day.count}</span><i style={{ height: `${day.count / max * 140}px`, minHeight: day.count ? 4 : 0 }} /><span>{day.label}</span></div>)}</div></section><section className="context-balance"><h2>Activity by context</h2>{report.byContext.map(context => <div className="insight-context" key={context.id}><strong>{context.name || 'Unassigned activity'}</strong><span>{context.count} activities</span></div>)}{!report.total && <p>No captured activity in this period.</p>}</section></div>
      <p className="muted">Calculated from all captured activity in this period, in your time zone. Context changes count transitions between assigned activities. Gaps and uncaptured work are unknown.</p></>}
  </div>;
}
