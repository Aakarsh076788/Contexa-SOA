let pending;
export function loadGoogleIdentity({ retry = false } = {}) {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (pending && !retry) return pending;
  pending = new Promise((resolve, reject) => {
    let script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (retry && script) { script.remove(); script = null; }
    const created = !script;
    if (!script) { script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.defer = true; }
    const cleanup = () => { clearTimeout(timer); script.removeEventListener('load', loaded); script.removeEventListener('error', failed); };
    const loaded = () => { cleanup(); window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('Google sign-in is unavailable. You can continue with email.')); };
    const failed = () => { cleanup(); reject(new Error('Google sign-in couldn’t load. Check your connection or continue with email.')); };
    const timer = setTimeout(failed, 15000);
    script.addEventListener('load', loaded, { once: true }); script.addEventListener('error', failed, { once: true });
    if (created) document.head.appendChild(script);
  }).catch(error => { pending = null; throw error; });
  return pending;
}
