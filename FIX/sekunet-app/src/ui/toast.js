// ─── TOAST NOTIFICATIONS ─────────────────────────────────────────────────────

let toastTimer = null;

export function showToast(msg, type = 'info', dur = 2400) {
  const t   = document.getElementById('toast');
  const ic  = document.getElementById('toast-icon');
  const txt = document.getElementById('toast-msg');
  if (!t || !ic || !txt) return;
  txt.textContent = msg;
  ic.className    = 't-ico ' + type;
  ic.textContent  = type === 'ok' ? '✓' : type === 'err' ? '✕' : '●';
  t.classList.add('on');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), dur);
}
