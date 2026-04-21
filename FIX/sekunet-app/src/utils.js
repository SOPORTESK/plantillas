// ─── UTILIDADES PURAS ─────────────────────────────────────────────────────────
// Sin dependencias de estado ni DOM — se pueden testear fácilmente.

export function escHtml(s) {
  return String(s)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/\n/g, '<br>');
}

export function escAttr(s) {
  return String(s).replace(/['"<>&\s]/g, c =>
    ({ "'": '&#39;', '"': '&quot;', '<': '&lt;', '>': '&gt;', '&': '&amp;', ' ': '_' }[c] ?? c)
  );
}

export function escJs(s) {
  return String(s).replace(/[\\'"\n\r]/g, c =>
    ({ '\\': '\\\\', "'": "\\'", '"': '\\"', '\n': '\\n', '\r': '\\r' }[c] ?? c)
  );
}

export function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

export function cp(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
  } else {
    const x = document.createElement('textarea');
    x.value = text;
    x.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(x);
    x.select();
    document.execCommand('copy');
    document.body.removeChild(x);
  }
}

export function genId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'id_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
}

export function formatDate() {
  return new Date().toLocaleDateString('es-CR');
}

export function formatTime(secs) {
  return Math.floor(secs / 60) + ':' + String(Math.floor(secs % 60)).padStart(2, '0');
}
