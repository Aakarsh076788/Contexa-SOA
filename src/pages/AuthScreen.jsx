import { useState, useEffect, useRef } from 'react';
import { loadGoogleIdentity } from '../lib/googleIdentity.js';
import { requestApi } from '../lib/api.js';

export default function AuthScreen({ onBack, onAuthenticated }) {
  const [mode, setMode] = useState(() => window.location.pathname === '/reset-password' ? 'reset' : 'signin');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [recoveryAvailable, setRecoveryAvailable] = useState(null);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [resetToken] = useState(() => window.location.pathname === '/reset-password' ? new URLSearchParams(window.location.hash.slice(1)).get('token') || new URLSearchParams(window.location.search).get('token') || '' : '');
  const [loading, setLoading] = useState(false);
  const googleBtnRef = useRef(null);
  const [googleError, setGoogleError] = useState('');
  const [googleRetry, setGoogleRetry] = useState(0);
  const googleResponse = useRef(null);

  const handleGoogleResponse = async (response) => {
    setError('');
    setLoading(true);
    try {
      const data = await requestApi('/api/auth/google', { method: 'POST', body: { credential: response.credential } });
      onAuthenticated(data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  googleResponse.current = handleGoogleResponse;

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const isGoogleConfigured = Boolean(googleClientId && !googleClientId.includes('YOUR_GOOGLE_CLIENT_ID') && !googleClientId.includes('xxxxxxxx'));

  useEffect(() => {
    if (window.location.pathname === '/reset-password') window.history.replaceState({}, '', '/reset-password');
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    requestApi('/api/auth/recovery/status', { signal: controller.signal }).then(data => setRecoveryAvailable(data.available)).catch(() => setRecoveryAvailable(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!isGoogleConfigured || !['signin', 'signup'].includes(mode)) return;
    let cancelled = false;
    let observer;
    setGoogleError('');
    loadGoogleIdentity({ retry: googleRetry > 0 }).then(identity => {
      if (cancelled || !googleBtnRef.current) return;
      identity.initialize({ client_id: googleClientId, callback: response => googleResponse.current?.(response), auto_select: false });
      let lastWidth;
      const render = () => {
        const container = googleBtnRef.current;
        if (!container) return;
        const width = Math.max(200, Math.min(400, Math.floor(container.getBoundingClientRect().width)));
        if (lastWidth === width) return;
        lastWidth = width;
        container.replaceChildren();
        identity.renderButton(container, { theme: 'filled_black', size: 'large', width, shape: 'pill', text: 'continue_with' });
      };
      render();
      observer = new ResizeObserver(render); observer.observe(googleBtnRef.current);
    }).catch(error => { if (!cancelled) setGoogleError(error.message); });
    return () => { cancelled = true; observer?.disconnect(); };
  }, [googleClientId, isGoogleConfigured, googleRetry, mode]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'recovery') { const result = await requestApi('/api/auth/recovery/request', { method: 'POST', body: { email: form.email } }); setRecoveryMessage(result.message); return; }
      if (mode === 'reset') {
        if (!resetToken) throw new Error('This reset link is missing its token. Request a new recovery email.');
        if (form.password !== confirmation) throw new Error('The passwords do not match.');
        await requestApi('/api/auth/recovery/reset', { method: 'POST', body: { token: resetToken, password: form.password } });
        window.history.replaceState({}, '', '/');
        setMode('signin'); setForm(current => ({ ...current, password: '' })); setConfirmation(''); setRecoveryMessage('Password updated. Sign in with your new password.'); return;
      }
      const path = mode === 'signin' ? '/api/auth/login' : '/api/auth/signup';
      const data = await requestApi(path, { method: 'POST', body: mode === 'signin' ? { email: form.email, password: form.password } : form });
      onAuthenticated(data);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  };
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <main className="auth-shell">
      <button className="auth-brand" type="button" onClick={onBack}><img src="/contexa-logo.png" alt="" className="brand-logo-img-sm" />contexa <span>/ workspace memory</span></button>
      <section className="auth-card">
        {['signin', 'signup'].includes(mode) && <div className="auth-tabs">
          <button type="button" onClick={() => { setMode('signin'); setError(''); }} className={mode === 'signin' ? 'selected' : ''}>Sign in</button>
          <button type="button" onClick={() => { setMode('signup'); setError(''); }} className={mode === 'signup' ? 'selected' : ''}>Create account</button>
        </div>}
        <div className="auth-copy">
          <p className="eyebrow">WELCOME TO CONTEXA</p>
          <h1>{mode === 'reset' ? 'Choose a new password.' : mode === 'recovery' ? 'Find your way back.' : mode === 'signin' ? 'Continue your workspace.' : 'Start with your workspace.'}</h1>
          <p>{mode === 'reset' ? 'Use at least 8 characters. Your other browser sessions will be signed out.' : mode === 'recovery' ? 'Enter your account email to request a password reset link.' : mode === 'signin' ? 'Sign in to access the contexts you saved.' : 'Create a Contexa account to save your contexts and settings.'}</p>
        </div>

        {/* Google Sign-In Button (shown when configured) */}
        {isGoogleConfigured && ['signin', 'signup'].includes(mode) && (
          <>
            <div className="google-signin-wrapper">
              <div ref={googleBtnRef} className="google-signin-btn" />
              {googleError && <p className="muted" role="status">{googleError}<button type="button" onClick={() => setGoogleRetry(value => value + 1)}>Retry Google sign-in</button></p>}
            </div>
            <div className="auth-divider">
              <span>or continue with email</span>
            </div>
          </>
        )}

        {recoveryMessage && <p className="settings-notice" role="status">{recoveryMessage}</p>}
        <form onSubmit={submit}>
          {mode === 'signup' && <label>Full name<input value={form.name} onChange={update('name')} required autoComplete="name" placeholder="Your name" /></label>}
          {mode !== 'reset' && <label>Email address<input type="email" value={form.email} onChange={update('email')} required autoComplete="email" placeholder="you@example.com" /></label>}
          {mode !== 'recovery' && <label>{mode === 'reset' ? 'New password' : 'Password'}<input type="password" value={form.password} onChange={update('password')} required minLength="8" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} placeholder="At least 8 characters" /></label>}
          {mode === 'reset' && <label>Confirm new password<input type="password" required minLength={8} maxLength={1024} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Please wait…' : mode === 'reset' ? 'Update password' : mode === 'recovery' ? 'Send recovery email' : mode === 'signin' ? 'Sign in to Contexa' : 'Create account'} <span aria-hidden="true">↗</span></button>
        </form>
        {mode === 'signin' && recoveryAvailable === true && <button type="button" className="back-link" onClick={() => { setMode('recovery'); setError(''); setRecoveryMessage(''); }}>Forgot password?</button>}
        {mode === 'signin' && recoveryAvailable === false && <details className="recovery-help"><summary>Can’t sign in?</summary><p>Password recovery isn’t configured for this server. Contact your workspace administrator.</p></details>}
        {['reset', 'recovery'].includes(mode) && <button type="button" className="back-link" onClick={() => { window.history.replaceState({}, '', '/'); setMode('signin'); setError(''); setRecoveryMessage(''); }}>Back to sign in</button>}
        <p className="auth-note"><i>◌</i> Your workspace is stored on this Contexa server. Cloud AI processing is off until you enable it.</p>
      </section>
      <button type="button" className="back-landing" onClick={onBack}>← Back to home</button>
    </main>
  );
}
