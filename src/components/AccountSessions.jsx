import { useState } from 'react';
import { requestApi } from '../lib/api.js';

export default function AccountSessions({ token }) {
  const [sessions, setSessions] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try { const data = await requestApi('/api/account/sessions', { token }); setSessions(data.sessions); setError(''); }
    catch (err) { setError(err.message); }
  };
  const revoke = async () => {
    setBusy(true); setError('');
    try { await requestApi('/api/account/sessions/others', { token, method: 'DELETE' }); await load(); setNotice('Other browser sessions signed out. This browser stays signed in.'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <details onToggle={event => { if (event.currentTarget.open) load(); }}>
    <summary>Signed-in browsers</summary>
    <p>Manage access to your account. Changing your password also signs out your other browser sessions.</p>
    {error && <p className="inline-error" role="alert">{error}<button type="button" onClick={load}>Retry</button></p>}
    {notice && <p role="status">{notice}</p>}
    {sessions && <><p>{sessions.length} active {sessions.length === 1 ? 'session' : 'sessions'}, including this browser.</p><button type="button" disabled={busy || !sessions.some(session => !session.current)} onClick={revoke}>{busy ? 'Signing out…' : 'Sign out other browsers'}</button></>}
  </details>;
}
