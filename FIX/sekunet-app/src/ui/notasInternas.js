// ─── NOTAS INTERNAS DEL CASO ACTIVO ──────────────────────────────────────────

import { state }    from '../state.js';
import { escHtml }  from '../utils.js';

export function renderNotasInternas() {
  const panel = document.getElementById('notas-internas-panel');
  if (!panel) return;

  const cur = state.cases.find(c => c.id === state.curCaseId);
  const notas = cur?.notasInternas ?? [];

  if (!notas.length) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  panel.innerHTML = `
    <div class="notas-header">📌 Notas internas (${notas.length})</div>
    ${notas.map(n => `
      <div class="nota-item">
        <div class="nota-time">${n.agente} · ${new Date(n.time).toLocaleString('es-CR')}</div>
        <div class="nota-text">${escHtml(n.text)}</div>
      </div>
    `).join('')}
  `;
}
