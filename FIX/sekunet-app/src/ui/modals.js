// ─── MODALES ──────────────────────────────────────────────────────────────────

export function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

export function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

export function closeOut(e, id) {
  if (e.target === document.getElementById(id)) closeModal(id);
}
