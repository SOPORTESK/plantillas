// ─── PUNTO DE ENTRADA PRINCIPAL ───────────────────────────────────────────────
// Orquesta el arranque de la app. No contiene lógica de negocio.

import { sb, onAuthChange }   from './db/supabase.js';
import { restoreSession, doLogin, doRegister, doLogout, updateProfile } from './features/auth.js';
import { state, setState }    from './state.js';
import { showToast }          from './ui/toast.js';
import { openModal, closeModal, closeOut } from './ui/modals.js';
import { sendMessage, handleKey, switchChat, reanudarIA } from './features/chat.js';
import { loadCase, deleteCase, createQuickCase, cambiarEstadoCaso,
         cerrarCasoActual, agregarNotaInterna, escalarAN2,
         getEstadoLabel, getEstadoColor, getChatType } from './features/cases.js';
import { addKnowledge, deleteTrain, saveDoc, deleteDoc,
         savePlantilla, deletePlantilla, saveRespToKB, indexDocumentChunks } from './features/knowledge.js';
import { clearChat, updateMsgBadges, startCorrection, toggleAudioPlay } from './ui/render.js';
import { renderChatsRecientes, renderConversacionesList, renderPlantillasList, showPanel,
         filterConv, searchConversaciones, clearConvSearch } from './ui/sidebar.js';
import { initPresence, stopPresence, setAgentStatus } from './ui/presence.js';
import { initIAMonitor, stopIAMonitor, reactivarIA } from './features/iaMonitor.js';
import { updateStatusBar } from './ui/statusBar.js';
import { renderNotasInternas } from './ui/notasInternas.js';
import { searchRAG }          from './api/gemini.js';
import { genId, escHtml, escAttr, escJs, esc, cp, formatDate } from './utils.js';
import { GEMINI_MODELS, ROLES, STAGES, STAGE_NAMES, CAT_COLORS } from './config.js';

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  showToast('Conectando a Supabase…', 'info', 3000);

  // Cargar datos en paralelo
  const [rCases, rTrain, rDocs, rPlantillas, rInventario] = await Promise.allSettled([
    sb.from('sek_cases').select('*').order('created_at', { ascending: false }).limit(10000),
    sb.from('sek_train').select('*').order('created_at', { ascending: false }).limit(10000),
    sb.from('sek_docs').select('*').order('created_at', { ascending: false }).limit(10000),
    sb.from('sek_plantillas').select('*').order('created_at', { ascending: false }).limit(10000),
    sb.from('sek_inventario').select('*').order('created_at', { ascending: false }).limit(10000),
  ]);

  const errors = [];

  // Casos — merge con localStorage
  const localCases = JSON.parse(localStorage.getItem('sek_cases') || '[]');
  if (rCases.status === 'fulfilled' && !rCases.value.error) {
    const remote  = rCases.value.data ?? [];
    const caseMap = new Map();
    remote.forEach(c => caseMap.set(c.id, c));
    localCases.forEach(lc => {
      const rc = caseMap.get(lc.id);
      if (!rc) { caseMap.set(lc.id, lc); return; }
      const ld = new Date(lc.updated_at || lc.created_at || 0);
      const rd = new Date(rc.updated_at || rc.created_at || 0);
      if (ld > rd) caseMap.set(lc.id, lc);
    });
    // Supabase es la fuente de verdad para historial — el local solo se usa si no hay remoto
    const remoteMap = new Map(remote.map(c => [c.id, c]));
    state.cases = Array.from(caseMap.values()).map(c => {
      const rc = remoteMap.get(c.id);
      return {
        ...c,
        createdAt  : c.createdAt   ?? c.created_at  ?? null,
        // Si hay versión remota, usar su historial; si no, usar local
        histcliente: rc ? (rc.histcliente ?? rc.histCliente ?? []) : (c.histcliente ?? c.histCliente ?? []),
        histtecnico: rc ? (rc.histtecnico ?? rc.histTecnico ?? []) : (c.histtecnico ?? c.histTecnico ?? []),
      };
    });
    localStorage.setItem('sek_cases', JSON.stringify(state.cases));
  } else {
    state.cases = localCases;
    errors.push('casos');
  }

  if (rTrain.status     === 'fulfilled' && !rTrain.value.error)     state.trainData  = rTrain.value.data     ?? [];
  else { state.trainData  = JSON.parse(localStorage.getItem('sek_train')      || '[]'); errors.push('entrenos'); }

  if (rDocs.status      === 'fulfilled' && !rDocs.value.error)      state.docs       = rDocs.value.data      ?? [];
  else { state.docs       = JSON.parse(localStorage.getItem('sek_docs')       || '[]'); errors.push('manuales'); }

  if (rPlantillas.status === 'fulfilled' && !rPlantillas.value.error) {
    const data = rPlantillas.value.data ?? [];
    state.plantillas = data.length ? data : await _seedDefaultPlantillas();
  } else {
    state.plantillas = JSON.parse(localStorage.getItem('sek_plantillas') || '[]');
    errors.push('plantillas');
  }

  if (rInventario.status === 'fulfilled' && !rInventario.value.error) state.inventario = rInventario.value.data ?? [];
  else { state.inventario = JSON.parse(localStorage.getItem('sek_inventario') || '[]'); errors.push('inventario'); }

  // RAG count
  try {
    const { count } = await sb.from('sek_doc_chunks').select('*', { count: 'exact', head: true });
    ['rag-hint-tec', 'rag-hint-cli', 'rag-status'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = `RAG: ${count ?? 0} fragmentos`;
    });
  } catch (_) { /* ignorar */ }

  // Badge de conexión
  const badge = document.getElementById('sb-status-badge');
  if (badge) {
    if (errors.length === 0) {
      badge.innerHTML = '<span class="dot"></span>En línea'; badge.className = 'pill ok';
      showToast(`Cargado: ${state.cases.length} casos · ${state.trainData.length} entrenos · ${state.docs.length} docs · ${state.plantillas.length} plantillas`, 'ok', 4000);
    } else {
      badge.innerHTML = '<span class="dot"></span>Error'; badge.className = 'pill info';
      showToast(`⚠️ Errores en: ${errors.join(', ')}`, 'err', 6000);
    }
  }

  // Escuchar mensajes entrantes de clientes (Supabase Realtime)
  _subscribeToIncomingMessages();

  // Render inicial
  _renderAll();
  switchChat(state.curChat);
}

// ─── REALTIME: mensajes entrantes de clientes reales ─────────────────────────
let _realtimeChannel  = null;
let _realtimeRetryMs  = 5000;
let _realtimeTimer    = null;

function _subscribeToIncomingMessages() {
  if (_realtimeChannel) {
    sb.removeChannel(_realtimeChannel).catch(() => {});
    _realtimeChannel = null;
  }
  try {
    _realtimeChannel = sb.channel('incoming-messages')
      .on('postgres_changes', {
        event : 'INSERT',
        schema: 'public',
        table : 'sek_messages',
        filter: 'status=eq.pending',
      }, payload => {
        const msg = payload.new;
        showToast(
          `📨 Nuevo mensaje de ${msg.from_name || msg.from_number} (${msg.channel.toUpperCase()})`,
          'info', 6000
        );
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          _realtimeRetryMs = 5000; // reset backoff al conectar OK
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Reconectar con backoff exponencial (máx 60s)
          if (_realtimeTimer) clearTimeout(_realtimeTimer);
          _realtimeRetryMs = Math.min(_realtimeRetryMs * 2, 60000);
          _realtimeTimer = setTimeout(_subscribeToIncomingMessages, _realtimeRetryMs);
        }
      });
  } catch (e) {
    // silenciar — reintenta automáticamente
    if (_realtimeTimer) clearTimeout(_realtimeTimer);
    _realtimeTimer = setTimeout(_subscribeToIncomingMessages, _realtimeRetryMs);
  }
}

// ─── RENDER INICIAL ───────────────────────────────────────────────────────────
function _renderAll() {
  renderChatsRecientes();
  renderConversacionesList();
  renderPlantillasList();
  updateStatusBar();
  showPanel('recientes');
}

// ─── SEED PLANTILLAS DEFAULT ──────────────────────────────────────────────────
async function _seedDefaultPlantillas() {
  const defaults = window.PLANTILLAS_DEFAULT ?? [];
  if (!defaults.length) return [];
  const toInsert = defaults.map(p => ({ id: genId(), nombre: p.nombre, cat: p.cat, texto: p.texto, date: formatDate() }));
  const { data, error } = await sb.from('sek_plantillas').insert(toInsert).select();
  if (!error && data) { showToast(`${data.length} plantillas por defecto creadas ✓`, 'ok', 3000); return data; }
  console.warn('seed plantillas:', error?.message);
  return toInsert;
}

// ─── EXPONER FUNCIONES AL HTML ────────────────────────────────────────────────
// Durante la transición, el HTML llama funciones globales desde onclick="...".
// Esto las expone en window para compatibilidad sin romper el HTML existente.
// En la Capa 3 se reemplazarán por event listeners.
Object.assign(window, {
  // Auth
  doLogin, doRegister, updateProfile,
  doLogout: async () => { await stopPresence(); await doLogout(); },
  // Chat
  sendMessage, handleKey, switchChat,
  // Casos
  loadCase, deleteCase, createQuickCase, cambiarEstadoCaso,
  cerrarCasoActual, agregarNotaInterna, escalarAN2,
  // Conocimiento
  addKnowledge, deleteTrain, saveDoc, deleteDoc,
  savePlantilla, deletePlantilla,
  saveRespToKBHandler: saveRespToKB,
  saveManualCorrectionHandler: async (btn, original) => {
    const corrected = btn.previousElementSibling.value.trim();
    if (!corrected) { showToast('Escribí la corrección', 'err'); return; }
    await addKnowledge('CORRECCIÓN: ' + original.substring(0, 200), corrected, 'procedimiento', 'chat', false);
    btn.closest('.correction-wrap').remove();
  },
  // UI
  openModal, closeModal, closeOut, showToast, cp,
  startCorrection, toggleAudioPlay,
  renderChatsRecientes, renderConversacionesList, renderNotasInternas,
  showPanel, filterConv, searchConversaciones, clearConvSearch,
  // Utils
  escHtml, escJs, esc, genId,
  // Estado (para acceso desde HTML legacy)
  getState: () => state,
  // Constantes expuestas para scripts inline
  GEMINI_MODELS,
  // Ajustes
  openAdminTools: () => {
    const ov = document.getElementById('admin-overlay');
    if (!ov) return;
    ov.classList.add('open');
    document.body.style.overflow = 'hidden';
    _renderAdminContent();
  },
  closeAdminTools: () => {
    document.getElementById('admin-overlay')?.classList.remove('open');
    document.body.style.overflow = '';
  },
  showAdminSection: (id, btn) => {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
    btn?.classList.add('active');
  },
});

// ─── TEMA ─────────────────────────────────────────────────────────────────────
function _applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon  = document.getElementById('theme-toggle-icon');
  const label = document.getElementById('theme-toggle-label');
  if (theme === 'dusk') {
    if (icon)  icon.textContent  = '☀️';
    if (label) label.textContent = 'Claro';
  } else {
    if (icon)  icon.textContent  = '�';
    if (label) label.textContent = 'Dusk';
  }
  localStorage.setItem('sek_theme', theme);
}

window._sek_toggleTheme = function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') ?? 'light';
  _applyTheme(cur === 'dusk' ? 'light' : 'dusk');
};

// ─── TOGGLE SIDEBAR MOBILE ───────────────────────────────────────────────────
function toggleMobileSidebar() {
  const aside   = document.getElementById('sb-aside');
  const overlay = document.getElementById('sb-overlay');
  if (!aside) return;
  const open = aside.classList.toggle('open');
  overlay?.classList.toggle('open', open);
}

// Exponer al scope global
Object.assign(window, {
  toggleTheme: window._sek_toggleTheme,
  setAgentStatus,
  reanudarIA,
  reactivarIA,
  toggleMobileSidebar,
});

// ─── ONLOAD ───────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // Restaurar tema guardado
  const savedTheme = localStorage.getItem('sek_theme') ?? 'light';
  _applyTheme(savedTheme);

  const loggedIn = await restoreSession();

  if (loggedIn) {
    document.getElementById('apikey-screen').style.display = 'none';
    _showAgentBadge();
    await init();
    initPresence();
    initIAMonitor();
    return;
  }

  document.getElementById('apikey-screen').style.display = 'flex';
});

// Login desde el formulario de index.html
window.addEventListener('sekunet:login-ok', async () => {
  _showAgentBadge();
  await init();
  initPresence();
  initIAMonitor();
});

// Reaccionar a cambios de sesión (ej: tab paralela)
onAuthChange(session => {
  if (!session) {
    const screen = document.getElementById('apikey-screen');
    const badge  = document.getElementById('agente-badge');
    if (screen) screen.style.display = 'flex';
    if (badge)  badge.style.display  = 'none';
  }
});

function _renderAdminContent() {
  const nd = state.docs.length, nt = state.trainData.length, ni = state.inventario.length;

  // Contadores sidebar
  ['count-docs','count-docs-2'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = nd || '0'; });
  ['count-train','count-train-2'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = nt || '0'; });
  ['count-inv','count-inv-2'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ni || '0'; });

  // Docs
  const dl = document.getElementById('admin-docs-list');
  if (dl) dl.innerHTML = !nd
    ? `<div class="admin-empty"><span class="admin-empty-icon">📄</span>Sin documentos cargados.<br>Subí manuales técnicos para que el agente los consulte.</div>`
    : state.docs.map(d => `
      <div class="admin-item">
        <div class="admin-item-icon">📄</div>
        <div class="admin-item-body">
          <div class="admin-item-title">${escHtml(d.name)}</div>
          <div class="admin-item-meta">${d.chunks ?? 0} fragmentos RAG · ${d.tipo ?? 'documento'}</div>
        </div>
        <div class="admin-item-actions">
          <button class="admin-item-del" onclick="deleteDoc('${d.id}')">Eliminar</button>
        </div>
      </div>`).join('');

  // Entrenamiento
  const tl = document.getElementById('admin-train-list');
  if (tl) tl.innerHTML = !nt
    ? `<div class="admin-empty"><span class="admin-empty-icon">🧠</span>Sin conocimientos cargados.<br>Agregá pares pregunta–respuesta para entrenar al agente.</div>`
    : state.trainData.map(t => `
      <div class="admin-item">
        <div class="admin-item-icon" style="background:var(--purple-bg)">🧠</div>
        <div class="admin-item-body">
          <div class="admin-item-title">${escHtml(t.q)}</div>
          <div class="admin-item-meta">${escHtml((t.a ?? '').substring(0, 90))}${(t.a?.length ?? 0) > 90 ? '…' : ''} · <strong>${escHtml(t.cat ?? 'general')}</strong></div>
        </div>
        <div class="admin-item-actions">
          <button class="admin-item-edit" onclick="editTrain('${t.id}')">Editar</button>
          <button class="admin-item-del" onclick="deleteTrain('${t.id}')">Eliminar</button>
        </div>
      </div>`).join('');

  // Inventario
  const il = document.getElementById('admin-inventario-list');
  if (il) il.innerHTML = !ni
    ? `<div class="admin-empty"><span class="admin-empty-icon">📦</span>Sin inventario cargado.<br>Agregá productos o importá desde CSV.</div>`
    : state.inventario.map(i => `
      <div class="admin-item">
        <div class="admin-item-icon" style="background:var(--green-bg)">📦</div>
        <div class="admin-item-body">
          <div class="admin-item-title">${escHtml(i.modelo ?? i.nombre ?? '')}</div>
          <div class="admin-item-meta">${escHtml(i.marca ?? '')}${i.tipo ? ' · ' + escHtml(i.tipo) : ''}</div>
        </div>
        <div class="admin-item-actions">
          <span style="font-size:13px;font-weight:700;color:var(--orange);padding:0 8px">${i.stock ?? 0} uds</span>
        </div>
      </div>`).join('');

  // Config IA — sincronizar valores actuales
  const selModel = document.getElementById('aj-model');
  const inpTemp  = document.getElementById('aj-temp');
  if (selModel) selModel.value = state.currentModelIdx ?? 0;
  if (inpTemp)  inpTemp.value  = state._temperature ?? 0.4;
}

function _showAgentBadge() {
  const badge = document.getElementById('agente-badge');
  const name  = document.getElementById('agente-name');
  if (!badge || !name) return;
  badge.style.display = 'inline-flex';
  const rol = state.currentAgent.rol;
  const icon = rol === ROLES.SUPERADMIN ? '👑' : rol === ROLES.ADMIN ? '⚙️' : '';
  name.textContent = icon + (state.currentAgent.nombre || state.currentAgent.email.split('@')[0]);
  const adminBtn = document.getElementById('admin-btn-container');
  if (adminBtn) adminBtn.style.display = 'block';
}
