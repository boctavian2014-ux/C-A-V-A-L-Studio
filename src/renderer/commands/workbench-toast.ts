let toastRoot: HTMLDivElement | null = null;

function ensureToastRoot(): HTMLDivElement {
  if (toastRoot && document.body.contains(toastRoot)) return toastRoot;
  toastRoot = document.createElement('div');
  toastRoot.setAttribute('aria-live', 'polite');
  toastRoot.style.cssText = [
    'position:fixed',
    'bottom:32px',
    'right:16px',
    'z-index:99999',
    'display:flex',
    'flex-direction:column',
    'gap:8px',
    'pointer-events:none',
  ].join(';');
  document.body.appendChild(toastRoot);
  return toastRoot;
}

export function showWorkbenchToast(message: string, durationMs = 2800): void {
  const root = ensureToastRoot();
  const el = document.createElement('div');
  el.textContent = message;
  el.style.cssText = [
    'background:#1a1d24',
    'color:#f5f7fa',
    'border:1px solid rgba(0,224,255,0.35)',
    'border-radius:8px',
    'padding:10px 14px',
    'font-family:Inter,system-ui,sans-serif',
    'font-size:12px',
    'box-shadow:0 8px 24px rgba(0,0,0,0.45)',
    'max-width:360px',
    'pointer-events:auto',
  ].join(';');
  root.appendChild(el);
  window.setTimeout(() => {
    el.remove();
    if (root.childElementCount === 0) {
      root.remove();
      toastRoot = null;
    }
  }, durationMs);
}
