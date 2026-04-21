// ─── SIDEBAR: renders de listas de casos y conversaciones ─────────────────────

import { state, setState }   from '../state.js';
import { escHtml }           from '../utils.js';
import { loadCase, deleteCase, getEstadoLabel, getEstadoColor, getChatType } from '../features/cases.js';
import { CAT_COLORS, STAGES, ROLES }  from '../config.js';

// ─── PANEL ACTIVO ────────────────────────────────────────────────────────────
let activePanel = 'recientes';

function _estadoBadgeStyle(estado) {
  const isDusk = document.documentElement.getAttribute('data-theme') === 'dusk';
  if (isDusk) {
    return {
      nuevo      : 'background:#1A3A8F;color:#BFD4FF;border-color:#3B64C8',
      pendiente  : 'background:#3D1F00;color:#FBB55A;border-color:#92400E',
      en_proceso : 'background:#1A3A8F;color:#BFD4FF;border-color:#3B64C8',
      resuelto   : 'background:#0A3D1F;color:#6EE7B7;border-color:#065F46',
      cerrado    : 'background:#1C2A3E;color:#7A96C2;border-color:#2A3F5F',
    }[estado] ?? 'background:#1A3A8F;color:#BFD4FF;border-color:#3B64C8';
  }
  const color = getEstadoColor(estado);
  return `color:${color};border-color:${color}`;
}

export function showPanel(name) {
  activePanel = name;
  ['recientes', 'conversaciones', 'plantillas', 'herramientas'].forEach(p => {
    const el = document.getElementById('panel-' + p);
    if (el) el.classList.toggle('hidden', p !== name);
    const btn = document.querySelector(`[data-panel="${p}"]`);
    if (btn) btn.classList.toggle('active', p === name);
  });
  if (name === 'recientes')       renderChatsRecientes();
  if (name === 'conversaciones')  renderConversacionesList();
  if (name === 'plantillas')      renderPlantillasList();
  if (name === 'herramientas')    renderHerramientas();
}

// ─── CHATS RECIENTES ──────────────────────────────────────────────────────────
export function renderChatsRecientes() {
  const el = document.getElementById('chats-recientes');
  if (!el) return;

  // Normalizar nombres de campo (Supabase lowercase vs camelCase local)
  state.cases.forEach(c => {
    if (!c.histcliente && c.histCliente) c.histcliente = c.histCliente;
    if (!c.histtecnico && c.histTecnico) c.histtecnico = c.histTecnico;
    if (!c.createdAt   && c.created_at)  c.createdAt   = c.created_at;
  });

  // Mostrar todos los casos que tengan algún mensaje, orden cronológico inverso
  const items = [...state.cases]
    .filter(c => (c.histcliente?.length ?? 0) > 0 || (c.histtecnico?.length ?? 0) > 0 || c.title)
    .sort((a, b) => (b.createdAt ?? b.created_at ?? b.date ?? '').localeCompare(a.createdAt ?? a.created_at ?? a.date ?? ''))
    .slice(0, 12);

  if (!items.length) {
    el.innerHTML = `<div class="sb-empty"><span class="sb-empty-icon">🎧</span>Sin chats de cliente aún</div>`;
    return;
  }

  el.innerHTML = items.map(c => {
    const isActive    = c.id === state.curCaseId;
    const estadoLabel = getEstadoLabel(c.estado);
    const badgeStyle  = _estadoBadgeStyle(c.estado);
    const preview     = _getClientePreview(c);
    const hora        = c.createdAt ? new Date(c.createdAt).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }) : (c.date ?? '');

    return `<div class="sb-case${isActive ? ' active' : ''}" onclick="loadCase('${c.id}')">
      <div class="cc-row" style="margin-bottom:3px">
        <span class="cc-date">${hora}</span>
        <span class="sb-case-estado" style="${badgeStyle}">${estadoLabel}</span>
      </div>
      <div class="cc-title">${escHtml(c.title)}</div>
      ${preview ? `<div class="sb-case-preview">${escHtml(preview)}</div>` : ''}
      ${state.currentAgent?.rol === ROLES.SUPERADMIN ? `<button class="del-case" onclick="deleteCase('${c.id}',event)" title="Eliminar">×</button>` : ''}
    </div>`;
  }).join('');
}

// ─── CONVERSACIONES (panel completo con búsqueda y filtros) ───────────────────
export function renderConversacionesList() {
  const el = document.getElementById('conversaciones-list');
  if (!el) return;

  let filtered = [...state.cases];

  // Filtro por estado
  if (state.convFilter && state.convFilter !== 'todos') {
    filtered = filtered.filter(c => c.estado === state.convFilter);
  }

  // Búsqueda
  if (state.convSearch?.trim()) {
    const q = state.convSearch.trim().toLowerCase();
    filtered = filtered.filter(c =>
      c.title?.toLowerCase().includes(q) ||
      c.histcliente?.some(m => m.content?.toLowerCase().includes(q)) ||
      c.histtecnico?.some(m => m.content?.toLowerCase().includes(q))
    );
  }

  // Contador
  const countEl = document.getElementById('conv-count');
  if (countEl) countEl.textContent = filtered.length
    ? `${filtered.length} conversación${filtered.length !== 1 ? 'es' : ''}`
    : '';

  // Botón limpiar búsqueda
  const clearBtn = document.getElementById('conv-search-clear');
  if (clearBtn) clearBtn.style.display = state.convSearch?.trim() ? 'flex' : 'none';

  if (!filtered.length) {
    el.innerHTML = `<div class="conv-empty">Sin resultados para "${escHtml(state.convSearch ?? '')}" — <button onclick="clearConvSearch()" style="background:none;border:none;color:var(--blue);cursor:pointer;font-size:13px">limpiar</button></div>`;
    return;
  }

  // Agrupar por fecha, orden cronológico inverso
  const sorted = [...filtered].sort((a, b) =>
    (b.createdAt ?? b.date ?? '').localeCompare(a.createdAt ?? a.date ?? ''));

  const groups = {};
  sorted.forEach(c => {
    const key = c.date ?? 'Sin fecha';
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  });

  el.innerHTML = Object.entries(groups).map(([date, cases]) => `
    <div class="conv-date-group">
      <div class="conv-date">${date}</div>
      ${cases.map(c => {
        const isActive    = c.id === state.curCaseId;
        const estadoLabel = getEstadoLabel(c.estado);
        const badgeStyle  = _estadoBadgeStyle(c.estado);
        const chatType    = getChatType(c);
        const preview     = _getPreview(c);
        return `<div class="conv-item${isActive ? ' active' : ''}" onclick="loadCase('${c.id}')">
          <div class="conv-title">${escHtml(c.title)}</div>
          <div class="conv-meta">
            <span class="conv-estado" style="${badgeStyle}">${estadoLabel}</span>
            <span style="margin-left:6px;font-size:11px;color:var(--text-light)">${chatType === 'cliente' ? '🎧' : chatType === 'tecnico' ? '🔧' : '🎧🔧'}</span>
          </div>
          ${preview ? `<div class="conv-preview">${escHtml(preview)}</div>` : ''}
          ${state.currentAgent?.rol === ROLES.SUPERADMIN ? `<button class="del-case" onclick="deleteCase('${c.id}',event)" title="Eliminar">×</button>` : ''}
        </div>`;
      }).join('')}
    </div>
  `).join('');
}

// ─── PLANTILLAS ───────────────────────────────────────────────────────────────
export function renderPlantillasList() {
  const el = document.getElementById('plantillas-list');
  if (!el) return;

  let items = [...state.plantillas];
  if (state.plantillaFilterCat !== 'all') {
    items = items.filter(p => p.cat === state.plantillaFilterCat);
  }

  if (!items.length) {
    el.innerHTML = `<div class="sb-empty"><span class="sb-empty-icon">📋</span>Sin plantillas</div>`;
    return;
  }

  el.innerHTML = items.map(p => {
    const col = CAT_COLORS[p.cat] ?? 'var(--a2)';
    return `<div class="ptl-card">
      <div class="ptl-card-head">
        <span class="ptl-card-name">${escHtml(p.nombre)}</span>
        <div class="ptl-card-actions">
          <button class="ptl-action" onclick="openPlantillaModal('${p.id}')">✏️</button>
          <button class="ptl-action del" onclick="deletePlantillaHandler('${p.id}')">🗑</button>
        </div>
      </div>
      <span class="ptl-card-cat" style="color:${col};border-color:${col}">${p.cat}</span>
      <div class="ptl-card-text">${escHtml(p.texto.substring(0, 120))}${p.texto.length > 120 ? '…' : ''}</div>
      <button class="ptl-copy-btn" onclick="navigator.clipboard?.writeText('${escHtml(p.texto).replace(/'/g,'&#39;')}');showToast('Copiado','ok')">Copiar</button>
    </div>`;
  }).join('');
}

// ─── FILTROS ──────────────────────────────────────────────────────────────────
export function filterConv(estado) {
  setState({ convFilter: estado });
  // Actualizar botones activos
  document.querySelectorAll('.conv-filter').forEach(b => {
    b.classList.toggle('active', b.dataset.estado === estado);
  });
  renderConversacionesList();
}

export function searchConversaciones(q) {
  setState({ convSearch: q });
  renderConversacionesList();
}

export function clearConvSearch() {
  setState({ convSearch: '' });
  const inp = document.getElementById('conv-search-input');
  if (inp) inp.value = '';
  renderConversacionesList();
}

export function filterPlantillas(cat) {
  setState({ plantillaFilterCat: cat });
  document.querySelectorAll('.ptl-cat-chip').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === cat);
  });
  renderPlantillasList();
}

// ─── HERRAMIENTAS ─────────────────────────────────────────────────────────────
export function renderHerramientas() {
  _renderTrainList();
  _renderDocsList();
  _renderInventarioList();
}

function _renderTrainList() {
  const el = document.getElementById('train-list');
  if (!el) return;
  if (!state.trainData.length) {
    el.innerHTML = `<div class="sb-empty" style="padding:16px 0">Sin conocimientos cargados</div>`;
    return;
  }
  el.innerHTML = state.trainData.map(t => `
    <div class="train-card" style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:7px;background:var(--bg)">
      <div class="train-meta">${escHtml(t.cat ?? 'general')}</div>
      <div class="train-q">${escHtml(t.q)}</div>
      <div class="train-a">${escHtml(t.a?.substring(0, 80))}${(t.a?.length ?? 0) > 80 ? '…' : ''}</div>
      <div class="train-foot">
        <span style="font-size:11px;color:var(--text-light)">${t.source ?? ''}</span>
        <button class="ptl-action del" onclick="deleteTrain('${t.id}')">Eliminar</button>
      </div>
    </div>`).join('');
}

function _renderDocsList() {
  const el = document.getElementById('docs-list');
  if (!el) return;
  if (!state.docs.length) {
    el.innerHTML = `<div class="sb-empty" style="padding:16px 0">Sin manuales cargados</div>`;
    return;
  }
  el.innerHTML = state.docs.map(d => `
    <div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:7px;background:var(--bg)">
      <div class="doc-name">${escHtml(d.name)}</div>
      <div class="doc-size">${d.chunks ?? 0} fragmentos RAG</div>
      <div style="display:flex;justify-content:flex-end;margin-top:6px">
        <button class="ptl-action del" onclick="deleteDoc('${d.id}')">Eliminar</button>
      </div>
    </div>`).join('');
}

function _renderInventarioList() {
  const el = document.getElementById('inventario-list');
  if (!el) return;
  if (!state.inventario.length) {
    el.innerHTML = `<div class="sb-empty" style="padding:16px 0">Sin inventario cargado</div>`;
    return;
  }
  el.innerHTML = state.inventario.slice(0, 30).map(i => `
    <div style="padding:9px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:var(--bg);display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text)">${escHtml(i.modelo ?? i.nombre ?? '')}</div>
        <div style="font-size:12px;color:var(--text-mute)">${escHtml(i.marca ?? '')} · ${escHtml(i.tipo ?? '')}</div>
      </div>
      <div style="font-size:12px;font-weight:700;color:var(--orange)">${i.stock ?? 0} uds</div>
    </div>`).join('');
}

// ─── HELPERS PRIVADOS ─────────────────────────────────────────────────────────
function _getPreview(c) {
  const allMsgs = [
    ...(c.histcliente ?? []),
    ...(c.histtecnico ?? []),
  ].filter(m => m.role === 'user');
  return allMsgs.at(-1)?.content?.substring(0, 80) ?? '';
}

function _getClientePreview(c) {
  const msgs = (c.histcliente ?? []).filter(m => m.role === 'user');
  return msgs.at(-1)?.content?.substring(0, 72) ?? '';
}
