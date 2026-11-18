import { useEffect, useRef } from 'react';
export function useModalFocus(onClose) {
  const ref = useRef(null);
  const callback = useRef(onClose);
  callback.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const root = ref.current;
    if (!root) return;
    const controls = () => [...root.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(x => x.offsetParent !== null);
    controls()[0]?.focus();
    const onKey = event => {
      if (event.key === 'Escape') callback.current();
      if (event.key === 'Tab') {
        const items = controls(), first = items[0], last = items.at(-1);
        if (!items.length) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    root.addEventListener('keydown', onKey);
    return () => { root.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, []);
  return ref;
}
