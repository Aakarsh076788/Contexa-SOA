import { useState } from 'react';
import { requestApi } from '../lib/api.js';

export default function PairedDevices({ token, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setError('');
    try { setData(await requestApi('/api/connectors/devices', { token })); }
    catch (err) { setError(err.message); }
  };
  const revoke = async (id, label) => {
    if (!window.confirm(`Disconnect ${label}? It will stop sending new activity until you pair it again. Saved activity will remain.`)) return;
    setBusy(true); setError('');
    try {
      await requestApi(id ? `/api/connectors/devices/${encodeURIComponent(id)}` : '/api/connectors/legacy-credential', { token, method: 'DELETE' });
      await load(); await onChanged();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const active = data?.devices.filter(device => !device.revokedAt) || [];
  return <details className="settings-section device-manager" onToggle={event => { if (event.currentTarget.open) load(); }}>
    <summary>Manage paired devices</summary>
    <p>Each new pairing has its own credential. Disconnect one installation without affecting the others.</p>
    {error && <p className="inline-error" role="alert">{error}<button type="button" onClick={load}>Retry</button></p>}
    {!data && !error && <p role="status">Loading devices…</p>}
    {data && !active.length && <p className="muted">No active paired devices yet. Open a connector’s setup guide to pair one.</p>}
    {active.map(device => <div className="paired-device" key={device.id}><div><strong>{device.label || device.source}</strong><span>{device.source} · Last used {device.lastUsedAt ? new Date(device.lastUsedAt).toLocaleString() : 'not yet'}</span></div><button type="button" disabled={busy} onClick={() => revoke(device.id, device.label || device.source)}>Disconnect</button></div>)}
    {data?.legacyCredentialActive && <div className="legacy-credential"><p>Older installations may share a legacy credential. Pair those devices again before disabling it.</p><button type="button" disabled={busy} onClick={() => revoke(null, 'all installations using the legacy credential')}>Disable legacy credential</button></div>}
  </details>;
}
