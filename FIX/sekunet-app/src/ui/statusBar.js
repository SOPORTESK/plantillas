// ─── BARRA DE ESTADO ─────────────────────────────────────────────────────────

import { state } from '../state.js';

export function updateStatusBar() {
  const memLabel  = document.getElementById('memory-label');
  const docsLabel = document.getElementById('docs-label');
  if (memLabel)  memLabel.textContent  = `${state.cases.length} casos · ${state.trainData.length} conocimientos`;
  if (docsLabel) docsLabel.textContent = `${state.docs.length} manuales`;
}

export async function updateModelLabel() {
  const el = document.getElementById('model-label');
  if (!el) return;
  const { GEMINI_MODELS } = await import('../config.js').catch(() => ({ GEMINI_MODELS: [] }));
  const model = GEMINI_MODELS[state.currentModelIdx];
  if (model) el.innerHTML = `<span class="dot"></span>${model.label}`;
}
