import { useEffect, useId, useRef, useState } from 'react';

const defaults = { accent: 'mint', density: 'comfortable', motion: true };
function readPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem('contexa-appearance') || '{}');
    return {
      accent: ['mint', 'iris', 'sky'].includes(saved.accent) ? saved.accent : defaults.accent,
      density: saved.density === 'compact' ? 'compact' : defaults.density,
      motion: saved.motion !== false
    };
  } catch { return defaults; }
}

export default function Appearance() {
  const [preferences, setPreferences] = useState(readPreferences);
  const [open, setOpen] = useState(false);
  const container = useRef(null);
  const trigger = useRef(null);
  const panelId = useId();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.accent = preferences.accent;
    root.dataset.density = preferences.density;
    root.dataset.motion = preferences.motion ? 'on' : 'off';
    try { localStorage.setItem('contexa-appearance', JSON.stringify(preferences)); } catch { /* Preferences still work for this session. */ }
  }, [preferences]);

  useEffect(() => {
    if (!open) return;
    const dismiss = event => { if (!container.current?.contains(event.target)) setOpen(false); };
    const escape = event => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [open]);

  const update = updates => setPreferences(current => ({ ...current, ...updates }));
  return <div className="appearance" ref={container}>
    <button className={`appearance-trigger ${open ? 'is-open' : ''}`} ref={trigger} type="button" aria-label="Appearance" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.6-3.2 1.5 1.5 0 0 1 1.2-2.4h1A4 4 0 0 0 21 11a9 9 0 0 0-9-8Z"/><circle cx="7.5" cy="10" r=".7"/><circle cx="10" cy="6.8" r=".7"/><circle cx="14" cy="6.8" r=".7"/><circle cx="17" cy="10" r=".7"/></svg>
      <span>Appearance</span><span className="appearance-indicator" aria-hidden="true" />
    </button>
    {open && <section id={panelId} className="appearance-panel" aria-label="Workspace appearance">
      <div className="appearance-heading"><strong>Make it yours</strong><button type="button" aria-label="Close appearance" onClick={() => { setOpen(false); trigger.current?.focus(); }}>×</button></div>
      <fieldset><legend>Accent color</legend><div className="accent-options">{[['mint', 'Mint'], ['iris', 'Iris'], ['sky', 'Sky']].map(([value, label]) => <button key={value} type="button" className={`accent-option ${value}`} aria-pressed={preferences.accent === value} onClick={() => update({ accent: value })}><i aria-hidden="true" />{label}{preferences.accent === value && <span aria-hidden="true">✓</span>}</button>)}</div></fieldset>
      <fieldset><legend>Spacing</legend><div className="density-options">{[['comfortable', 'Comfortable'], ['compact', 'Compact']].map(([value, label]) => <button key={value} type="button" aria-pressed={preferences.density === value} onClick={() => update({ density: value })}>{label}</button>)}</div></fieldset>
      <label className="motion-preference"><span><strong>Smooth motion</strong><small>Always respects reduced motion on your device.</small></span><input type="checkbox" role="switch" checked={preferences.motion} onChange={event => update({ motion: event.target.checked })} /></label>
      <button type="button" className="appearance-reset" onClick={() => setPreferences({ ...defaults })}>Reset appearance</button>
    </section>}
  </div>;
}
