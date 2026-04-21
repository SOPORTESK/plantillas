// ─── SWITCH DE CHAT ───────────────────────────────────────────────────────────
// Módulo separado para evitar ciclos de importación entre cases.js y chat.js

import { state, setState } from '../state.js';

export function switchChat(chat) {
  setState({ curChat: chat });
  ['cliente', 'tecnico'].forEach(side => {
    const view = document.getElementById('view-' + side);
    if (view) view.classList.toggle('hidden', side !== chat);
    const btn = document.getElementById('toggle-' + side);
    if (btn) btn.classList.toggle('active', side === chat);
  });
  requestAnimationFrame(() => {
    const el = document.getElementById('msgs-' + chat);
    if (el) el.scrollTop = el.scrollHeight;
  });
}
