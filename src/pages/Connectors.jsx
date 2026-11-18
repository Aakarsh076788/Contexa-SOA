import { useState, useEffect, useRef } from 'react';
import { requestApi } from '../lib/api.js';
import { APP_CATALOG } from '../lib/catalog.js';
import { AppLogo, Switch } from '../components/ui.jsx';
import PairedDevices from '../components/PairedDevices.jsx';
import { useModalFocus } from '../lib/useModalFocus.js';

export default function Connectors({ connectors, token, onChanged }) {
  const [notice, setNotice] = useState('');
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');
  const [diagnostics, setDiagnostics] = useState([]);
  useEffect(() => { requestApi('/api/connectors/diagnostics', { token }).then(setDiagnostics).catch(err => setNotice(err.message)); }, [token, connectors]);
  const diagnosticMap = new Map(diagnostics.map(item => [item.source, item]));
  const [activeModalApp, setActiveModalApp] = useState(null);
  const installedMap = new Map(connectors.map((item) => [item.source, item]));

  const toggle = async (app) => {
    const item = installedMap.get(app.id);
    const isSetupDone = Boolean(diagnosticMap.get(app.id)?.configured || item?.lastSyncAt);
    const currentlyConnected = Boolean(item?.connected);

    // If user tries to turn ON an unconfigured connector, protect against false active state
    if (!currentlyConnected && !isSetupDone) {
      setActiveModalApp(app);
      setNotice(`Setup required: Please complete the 1-minute setup for ${app.name} before enabling tracking.`);
      return;
    }

    try {
      await requestApi(`/api/connectors/${app.id}`, {
        token,
        method: 'PUT',
        body: { connected: !currentlyConnected }
      });
      await onChanged();
      setNotice(`${app.name} tracking ${currentlyConnected ? 'paused' : 'resumed'}.`);
    } catch (error) {
      setNotice(error.message);
    }
  };

  const availableApps = APP_CATALOG.filter(app => ['chrome', 'vscode', 'github', 'discord', 'telegram'].includes(app.id));
  const filteredApps = availableApps.filter(app => {
    const matchesSearch = `${app.name} ${app.description} ${app.category}`.toLowerCase().includes(search.toLowerCase());
    const isInstalled = Boolean(installedMap.get(app.id)?.connected);
    const matchesTab = activeTab === 'All' 
      || (activeTab === 'Active' && isInstalled)
      || (app.category === activeTab);
    return matchesSearch && matchesTab;
  });

  const activeCount = diagnostics.filter(item => item.enabled).length;

  return (
    <div className="settings-page connectors-hub">
      <section className="settings-intro">
        <div>
          <p className="eyebrow">INTEGRATION HUB</p>
          <h1>Connected Applications</h1>
          <p className="description">Connect your developer tools, browsers, and team chat to automate context intelligence.</p>
        </div>
      </section>

      {notice && <div className="settings-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}

      <div className="connectors-topbar">
        <div className="filter-tabs">
          {['All', 'Active'].map((tab) => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={activeTab === tab ? 'selected' : ''}>
              {tab}
            </button>
          ))}
        </div>
        
        <div className="connectors-stats">
          <span className="stat-pill active"><i></i> {activeCount} Active</span>
          <span className="stat-pill">{availableApps.length - activeCount} Available to connect</span>
        </div>
      </div>

      <div className="context-toolbar" style={{ marginTop: '-8px' }}>
        <label className="context-search" style={{ flex: 1 }}>
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search connectors" placeholder="Find a tool…" />
        </label>
      </div>


      <div className="connectors-grid-v2">
        {filteredApps.map(app => {
          const installed = installedMap.get(app.id);
          const isSetupDone = Boolean(diagnosticMap.get(app.id)?.configured || installed?.lastSyncAt);
          const isConnected = Boolean(installed?.connected && isSetupDone);

          let statusType = 'needed';
          let statusLabel = 'Setup Required';
          if (isSetupDone) {
            if (isConnected) {
              statusType = 'active';
              statusLabel = diagnosticMap.get(app.id)?.status === 'receiving' ? 'Activity received' : 'Awaiting activity';
            } else {
              statusType = 'paused';
              statusLabel = 'Paused';
            }
          }

          return (
            <article key={app.id} className="connector-app-card" onClick={() => setActiveModalApp(app)}>
              <div className="connector-card-header">
                <div className="app-logo-box" style={{ borderColor: `${app.color}33` }}>
                  <AppLogo id={app.id} size={28} />
                </div>
                <div className="app-badges">
                  <span className="app-category-badge">{app.tag}</span>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Switch checked={isConnected} onChange={() => toggle(app)} label={`Toggle ${app.name}`} />
                  </div>
                </div>
              </div>

              <div className="connector-card-body">
                <h3>
                  {app.name}
                  {statusType === 'active' && <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 6px #22c55e' }} />}
                  {statusType === 'paused' && <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#eab308', display: 'inline-block', boxShadow: '0 0 6px #eab308' }} />}
                </h3>
                <p>{app.description}</p>
              </div>

              <div className="connector-card-footer">
                <span className={`connection-status-badge ${statusType}`}>
                  <i /> {statusLabel}
                </span>
                <button type="button" className="btn-open-guide" onClick={(e) => { e.stopPropagation(); setActiveModalApp(app); }}>
                  Setup & Files ↗
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <details className="connector-diagnostics"><summary>Capture diagnostics</summary><p>Enabled means collection is allowed. A successful capture confirms delivery.</p><div>{diagnostics.map(item => <article key={item.source}><strong>{item.source}</strong><span>{item.status.replaceAll('_', ' ')}</span><small>Last captured: {item.lastCaptureAt ? new Date(item.lastCaptureAt).toLocaleString() : 'No activity yet'}</small>{item.lastError && <p role="status">{item.lastError}</p>}<small>Collects: {item.scopes.join(', ')}</small></article>)}</div></details>
      <PairedDevices token={token} onChanged={onChanged} />

      {activeModalApp && (
        <ConnectorDetailModal 
          app={activeModalApp} 
          token={token} 
          installed={installedMap.get(activeModalApp.id)} 
          onClose={() => setActiveModalApp(null)} 
          onChanged={onChanged} 
          onNotice={(msg) => { setNotice(msg); }} 
        />
      )}
    </div>
  );
}
function ConnectorDetailModal({ app, token, installed, onClose, onChanged, onNotice }) {
  const modalRef = useModalFocus(onClose);
  const [modalTab, setModalTab] = useState('guide');
  const [botToken, setBotToken] = useState('');
  const [channel, setChannel] = useState('');
  const [ghToken, setGhToken] = useState('');
  const [tgToken, setTgToken] = useState('');
  const [tgBotUsername, setTgBotUsername] = useState(null);
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false);
  const [testStatus, setTestStatus] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [isPairingSuccess, setIsPairingSuccess] = useState(false);

  const createPairingCode = async () => {
    try {
      const res = await requestApi('/api/connectors/pair/create', {
        token,
        method: 'POST',
        body: { source: app.id }
      });
      setPairingCode(res.code);
    } catch (err) {
      onNotice(err.message);
    }
  };

  useEffect(() => {
    if (app.id === 'chrome' || app.id === 'vscode' || app.id === 'discord' || app.id === 'telegram') {
      createPairingCode();
    }
  }, [app.id]);

  // Live polling for 6-digit pairing verification
  useEffect(() => {
    if (!pairingCode || isPairingSuccess) return;
    const interval = setInterval(async () => {
      try {
        const res = await requestApi(`/api/connectors/pair/check/${pairingCode}`, { token });
        if (res?.paired) {
          setIsPairingSuccess(true);
          clearInterval(interval);
          onNotice(`🎉 ${app.name} connected successfully!`);
          await onChanged();
          setTimeout(() => {
            onClose();
          }, 1200);
        }
      } catch (err) {
        if (err.status === 404) { clearInterval(interval); setPairingCode(''); onNotice('Pairing code expired. Generate a new code to continue.'); }
      }
    }, 1200);
    return () => clearInterval(interval);
  }, [pairingCode, isPairingSuccess]);

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      onNotice('Copy failed. Select and copy manually.');
    }
  };

  const handleDiscordSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await requestApi('/api/connectors/discord/connect', { token, method: 'POST', body: { token: botToken, channel } });
      setBotToken('');
      await onChanged();
      onNotice('Discord Bot token saved! Run `npm run discord` in terminal to launch.');
    } catch (err) { onNotice(err.message); }
    finally { setBusy(false); }
  };

  const handleTelegramSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await requestApi('/api/connectors/telegram/connect', { token, method: 'POST', body: { token: tgToken } });
      setTgToken('');
      setTgBotUsername(res.botUsername);
      await onChanged();
      onNotice(`🎉 Connected to Telegram Bot @${res.botUsername}!`);
    } catch (err) { onNotice(err.message); }
    finally { setBusy(false); }
  };

  const handleGitHubSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await requestApi('/api/connectors/github/connect', { token, method: 'POST', body: { token: ghToken } });
      setGhToken('');
      await onChanged();
      onNotice(`GitHub connected as @${res.login}!`);
    } catch (err) { onNotice(err.message); }
    finally { setBusy(false); }
  };

  const handleTestSignal = async () => {
    setBusy(true);
    setTestStatus('Sending test signal...');
    try {
      const endpoint = '/api/activity';
      const payload = {
        source: app.id,
        type: 'test_signal_ping',
        kind: 'ACTIVITY',
        title: `Test ping from ${app.name}`,
        detail: `Verified integration with Contexa at ${new Date().toLocaleTimeString()}`,
        project: 'Contexa Core'
      };

      const result = await requestApi(endpoint, { token, method: 'POST', body: payload });
      await onChanged();
      setTestStatus(result.ignored ? `Signal not stored: ${result.reason.replaceAll('_', ' ')}.` : '✓ Signal captured and added to Timeline.');
    } catch (err) {
      setTestStatus(`✗ Test failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="connector-modal-backdrop" onClick={onClose}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="connector-dialog-title" className="connector-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-app-identity">
            <div className="app-logo-box" style={{ borderColor: `${app.color}44` }}>
              <AppLogo id={app.id} size={30} />
            </div>
            <div>
              <h2 id="connector-dialog-title">{app.name}</h2>
              <p>{app.tag} · {installed?.connected ? '🟢 Connected' : '⚪ Setup Needed'}</p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-tabs">
          <button type="button" className={`modal-tab-btn ${modalTab === 'guide' ? 'active' : ''}`} onClick={() => setModalTab('guide')}>
            1. Setup Guide & Pairing
          </button>
          {(app.id === 'github' || app.id === 'telegram') && (
            <button type="button" className={`modal-tab-btn ${modalTab === 'config' ? 'active' : ''}`} onClick={() => setModalTab('config')}>
              2. Credentials & Config
            </button>
          )}
          <button type="button" className={`modal-tab-btn ${modalTab === 'tester' ? 'active' : ''}`} onClick={() => setModalTab('tester')}>
            {app.id === 'github' || app.id === 'telegram' ? '3' : '2'}. Signal Simulator
          </button>
          <button type="button" className={`modal-tab-btn ${modalTab === 'privacy' ? 'active' : ''}`} onClick={() => setModalTab('privacy')}>
            {app.id === 'github' || app.id === 'telegram' ? '4' : '3'}. Permissions & Scopes
          </button>
        </div>

        <div className="modal-body">
          {modalTab === 'guide' && (
            <>
              {['chrome', 'vscode', 'discord', 'telegram'].includes(app.id) && !pairingCode && <button type="button" onClick={createPairingCode}>Generate pairing code</button>}
              {pairingCode && (
                <div className="netflix-pair-card">
                  <div>
                    <p className="eyebrow" style={{ color: '#c4b5fd' }}>INSTANT 6-CHARACTER PAIRING</p>
                    <h3 style={{ margin: '4px 0', fontSize: '16px' }}>
                      {app.id === 'discord' ? 'Type !link in your Discord Server' : app.id === 'telegram' ? 'Type /link in your Telegram Chat' : `Enter this code in your ${app.name} Extension`}
                    </h3>
                    <p style={{ fontSize: '11px', color: '#a1a1aa' }}>
                      {app.id === 'discord' ? 'In a channel where your bot is present, type:' : app.id === 'telegram' ? 'In your linked bot chat or group, type:' : app.id === 'vscode' ? 'Run Contexa: Pair Workspace from the VS Code Command Palette and enter these 6 characters:' : 'Open the Contexa Chrome popup and enter these 6 characters:'}
                    </p>
                  </div>

                  <div className="netflix-pin-display">
                    {pairingCode.slice(0, 3).split('').map((char, i) => (
                      <span key={i} className="pin-digit">{char}</span>
                    ))}
                    <span className="pin-dash">-</span>
                    {pairingCode.slice(3, 6).split('').map((char, i) => (
                      <span key={i + 3} className="pin-digit">{char}</span>
                    ))}
                  </div>

                  {(app.id === 'discord' || app.id === 'telegram') && (
                    <div className="code-snippet" style={{ margin: '4px auto 0', maxWidth: '340px' }}>
                      <code>{app.id === 'discord' ? `!link ${pairingCode}` : `/link ${pairingCode}`}</code>
                      <button type="button" onClick={() => copyText(app.id === 'discord' ? `!link ${pairingCode}` : `/link ${pairingCode}`, 'bot-cmd')}>
                        {copied === 'bot-cmd' ? 'Copied!' : 'Copy Command'}
                      </button>
                    </div>
                  )}

                  <div className="pair-radar" style={{ marginTop: '8px' }}>
                    <i></i>
                    <span>{isPairingSuccess ? '🎉 Paired successfully! Closing...' : (app.id === 'discord' ? 'Waiting for !link command in Discord...' : app.id === 'telegram' ? 'Waiting for /link command in Telegram...' : 'Listening for extension pairing...')}</span>
                  </div>
                </div>
              )}

              {app.inviteUrl && (
                <div style={{ padding: '14px 18px', background: `linear-gradient(135deg, ${app.color}22, rgba(79, 70, 229, 0.15))`, border: `1px solid ${app.color}44`, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: '13px', color: '#f4f4f5' }}>Official Contexa {app.name} Bot</strong>
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#a1a1aa' }}>{app.id === 'telegram' ? '1-click to add @contexa_app_bot to your group or chat.' : '1-click invite to add the bot to your team server.'}</p>
                  </div>
                  <a href={app.inviteUrl} target="_blank" rel="noreferrer" className="primary-action" style={{ textDecoration: 'none', background: app.color, color: '#fff', fontSize: '12px', padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    {app.id === 'telegram' ? '➕ Add Bot to Telegram' : '➕ Add Bot to Discord'}
                  </a>
                </div>
              )}

              {app.downloadUrl && (
                <div style={{ padding: '14px 18px', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(99, 102, 241, 0.15))', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: '13px', color: '#f4f4f5' }}>Ready-to-use Extension Package</strong>
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#a1a1aa' }}>Download the pre-bundled {app.name} extension ready to install.</p>
                  </div>
                  <a href={app.downloadUrl} download={app.downloadName} className="primary-action" style={{ textDecoration: 'none', background: '#8b5cf6', color: '#fff', fontSize: '12px', padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    📥 Download .ZIP
                  </a>
                </div>
              )}


              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {app.steps?.map((step, idx) => (
                  <div key={idx} className="step-card">
                    <div className="step-number">{idx + 1}</div>
                    <div className="step-content" style={{ flex: 1 }}>
                      <h4>{step.title}</h4>
                      <p>{step.text}</p>
                      {step.code && (
                        <div className="code-snippet">
                          <code>{step.code}</code>
                          <button type="button" onClick={() => copyText(step.code, `step-${idx}`)}>
                            {copied === `step-${idx}` ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {modalTab === 'config' && app.id === 'github' && (
            <form onSubmit={handleGitHubSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h3>Configure GitHub Token</h3>
              <p style={{ color: '#a1a1aa', fontSize: '12px' }}>Paste a Personal Access Token with repo read scopes to synchronize issues and pull requests.</p>
              <label>
                Fine-grained Personal Access Token
                <input type="password" value={ghToken} onChange={(e) => setGhToken(e.target.value)} placeholder="github_pat_..." required />
              </label>
              <button type="submit" disabled={busy || !ghToken.trim()} className="primary-action">
                {busy ? 'Connecting...' : 'Connect GitHub'}
              </button>
            </form>
          )}

          {modalTab === 'config' && app.id === 'discord' && (
            <form onSubmit={handleDiscordSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h3>Configure Discord Bot</h3>
              <p style={{ color: '#a1a1aa', fontSize: '12px' }}>Save your Discord Bot Token and choose which channels to listen to.</p>
              <label>
                Discord Bot Token
                <input type="password" value={botToken} onChange={(e) => setBotToken(e.target.value)} placeholder="Paste bot token from Developer Portal..." required />
              </label>
              <label>
                Tracked Channel (optional)
                <input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="e.g. dev-chat, bugs (leave blank for all)" />
              </label>
              <button type="submit" disabled={busy || !botToken.trim()} className="primary-action">
                {busy ? 'Saving...' : 'Save Bot Token'}
              </button>
            </form>
          )}

          {modalTab === 'config' && app.id === 'telegram' && (
            <form onSubmit={handleTelegramSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Connect Telegram Bot</h3>
                <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="primary-action" style={{ background: '#229ED9', color: '#fff', fontSize: '11px', padding: '6px 12px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  🤖 Open @BotFather ↗
                </a>
              </div>
              <p style={{ color: '#a1a1aa', fontSize: '12px', lineHeight: '1.5' }}>
                1. Open <strong>@BotFather</strong> on Telegram and send <code>/newbot</code>.<br />
                2. Choose a name and username for your bot (e.g. <code>MyContexaBot</code>).<br />
                3. Paste the HTTP API token BotFather gives you below:
              </p>
              <label>
                Telegram Bot HTTP API Token
                <input type="password" value={tgToken} onChange={(e) => setTgToken(e.target.value)} placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..." required />
              </label>
              <button type="submit" disabled={busy || !tgToken.trim()} className="primary-action" style={{ background: '#229ED9', color: '#fff' }}>
                {busy ? 'Verifying & Saving...' : 'Save & Connect Bot'}
              </button>
            </form>
          )}

          {modalTab === 'tester' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3>Test API capture</h3>
              <p style={{ color: '#a1a1aa', fontSize: '12px' }}>Send a diagnostic ping for {app.name} to this workspace. This checks API capture, not delivery from the real tool. Diagnostic pings stay out of work contexts and analytics.</p>
              <button type="button" className="primary-action" disabled={busy} onClick={handleTestSignal} style={{ background: app.color, color: '#fff' }}>
                {busy ? 'Sending...' : `Send Test ${app.name} Signal`}
              </button>
              {testStatus && <p style={{ fontSize: '12px', fontWeight: 600, color: testStatus.startsWith('✓') ? '#86efac' : '#fca5a5' }}>{testStatus}</p>}
            </div>
          )}

          {modalTab === 'privacy' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h3>Data & Permission Scopes</h3>
              <p style={{ color: '#a1a1aa', fontSize: '12px' }}>Browser and editor connectors collect metadata. Chat gateways can include message text according to your Settings. Cloud processing requires a separate opt-in.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <strong>Connector capabilities:</strong>
                {app.scopes?.map(s => (
                  <span key={s} style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', color: '#d8b4fe', fontSize: '11px', fontFamily: 'DM Mono' }}>
                    ✓ {s}
                  </span>
                ))}
              </div>
              <p style={{ color: '#71717a', fontSize: '11px', marginTop: '8px' }}>Browser capture skips incognito tabs and page bodies. Editor capture excludes source code. Configure bot permissions and channel filters before linking a chat gateway.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
