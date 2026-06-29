// ------------------------------------------------------------------
//  Minimal modal/dialog helper. Returns the body/footer nodes so the
//  caller can populate and wire them up, plus a close() function.
//  Closes on overlay click, the ✕ button, or Escape.
// ------------------------------------------------------------------

export function openModal({ title = '', size = '' } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal' + (size === 'sm' ? ' modal-sm' : '');

  const header = document.createElement('div');
  header.className = 'modal-header';
  const h2 = document.createElement('h2');
  h2.textContent = title; // text, never HTML — safe for user-supplied names
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-icon';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.innerHTML = svgClose();
  header.append(h2, closeBtn);

  const body = document.createElement('div');
  body.className = 'modal-body';

  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  modal.append(header, body, footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', onKey);

  return { overlay, modal, header, body, footer, setTitle: (t) => (h2.textContent = t), close };
}

function svgClose() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
}

// Promise-based confirm dialog (avoids native window.confirm).
export function confirmDialog({
  title = 'Are you sure?',
  message = '',
  confirmText = 'Confirm',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const { body, footer, close } = openModal({ title, size: 'sm' });
    const p = document.createElement('p');
    p.textContent = message;
    p.style.margin = '0';
    body.appendChild(p);
    footer.innerHTML = `
      <span class="spacer"></span>
      <button class="btn" data-cancel>Cancel</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${confirmText}</button>`;
    footer.querySelector('[data-cancel]').addEventListener('click', () => {
      close();
      resolve(false);
    });
    footer.querySelector('[data-ok]').addEventListener('click', () => {
      close();
      resolve(true);
    });
  });
}
