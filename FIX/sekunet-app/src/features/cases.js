// ─── GESTIÓN DE CASOS ─────────────────────────────────────────────────────────

import { sb }         from '../db/supabase.js';
import { state, setState, resetCaseData } from '../state.js';
import { genId, formatDate } from '../utils.js';
import { showToast }  from '../ui/toast.js';
import {
  clearChat, appendUserMsgRaw, appendRawIAMsg,
  updateMsgBadges,
} from '../ui/render.js';
import { extraerDatosCliente, extraerDatosEquipo } from './dataExtractor.js';
import { renderChatsRecientes, renderConversacionesList } from '../ui/sidebar.js';
import { renderNotasInternas } from '../ui/notasInternas.js';
import { resetClientePanel, renderClientePanel } from '../ui/clientePanel.js';
import { updateStatusBar } from '../ui/statusBar.js';
import { switchChat } from '../ui/chatSwitch.js';
import { ROLES } from '../config.js';

// ─── CREAR CASO RÁPIDO ────────────────────────────────────────────────────────
export async function createQuickCase(title) {
  if (state.curCaseId) await saveCurrentCaseHistory();

  const id  = genId();
  const cat = state.curStage ?? 'apertura';
  const c   = {
    id, title, cat, date: formatDate(),
    estado: 'nuevo', canal: 'web', prioridad: 'normal',
    cliente: { nombre:'', telefono:'', email:'' },
    tags: [], notasInternas: [], histcliente: [], histtecnico: [],
  };

  const { error } = await sb.from('sek_cases').insert({
    id, title, cat, date: c.date, histcliente: [], histtecnico: [],
  });

  if (error) {
    console.error('case insert:', error);
    state.cases.unshift(c);
    _persistCasesLocally();
    showToast('Caso creado localmente', 'info', 3000);
  } else {
    state.cases.unshift(c);
    showToast('Nueva consulta iniciada', 'ok', 1500);
  }

  _activateCase(c);
}

// ─── CARGAR CASO ──────────────────────────────────────────────────────────────
export async function loadCase(id) {
  if (state.curCaseId) await saveCurrentCaseHistory();
  if (state._inactivityTimer) { clearTimeout(state._inactivityTimer); state._inactivityTimer = null; }

  const c = state.cases.find(x => x.id === id);
  if (!c) return;

  if (!c.mediaLog) c.mediaLog = [];

  // Siempre refrescar historial desde Supabase para garantizar datos actualizados
  const { data: fresh, error: fetchErr } = await sb
    .from('sek_cases')
    .select('histcliente, histtecnico')
    .eq('id', id)
    .maybeSingle();

  if (!fetchErr && fresh) {
    c.histcliente = fresh.histcliente ?? c.histcliente ?? [];
    c.histtecnico = fresh.histtecnico ?? c.histtecnico ?? [];
  }

  setState({
    curCaseId          : id,
    chatHistoryCliente : c.histcliente ?? [],
    chatHistoryTecnico : c.histtecnico ?? [],
  });

  clearChat('cliente'); clearChat('tecnico');
  resetCaseData();

  // Auto-switch al chat que tiene mensajes
  if (state.chatHistoryCliente.length && !state.chatHistoryTecnico.length) {
    switchChat('cliente');
  } else if (state.chatHistoryTecnico.length && !state.chatHistoryCliente.length) {
    switchChat('tecnico');
  }

  // Renderizar histórico
  state.chatHistoryCliente.forEach(m => {
    if (m.role === 'user') { appendUserMsgRaw(m.content, 'cliente'); extraerDatosCliente(m.content); }
    else appendRawIAMsg(m.content, 'cliente');
  });
  state.chatHistoryTecnico.forEach(m => {
    if (m.role === 'user') { appendUserMsgRaw(m.content, 'tecnico'); extraerDatosEquipo(m.content); }
    else appendRawIAMsg(m.content, 'tecnico');
  });

  if (state.chatHistoryCliente.length) setState({ clienteSaludado: true });

  updateMsgBadges();
  renderChatsRecientes();
  renderConversacionesList();
  renderNotasInternas();

  requestAnimationFrame(() => {
    ['cliente', 'tecnico'].forEach(side => {
      const el = document.getElementById('msgs-' + side);
      if (el) el.scrollTop = el.scrollHeight;
    });
  });

  showToast(`Conversación cargada: ${c.title}`, 'ok', 2000);
  resetClientePanel();
  renderClientePanel();

  // Cerrar sidebar en móvil al cargar un caso
  document.getElementById('sb-aside')?.classList.remove('open');
  document.getElementById('sb-overlay')?.classList.remove('open');
}

// ─── ELIMINAR CASO ────────────────────────────────────────────────────────────
export async function deleteCase(id, e) {
  e.stopPropagation();
  if (state.currentAgent?.rol !== ROLES.SUPERADMIN) {
    showToast('Solo el superadministrador puede eliminar conversaciones', 'err', 3500);
    return;
  }
  if (!confirm('¿Eliminar este caso?')) return;

  setState({ cases: state.cases.filter(c => c.id !== id) });
  _persistCasesLocally();

  if (state.curCaseId === id) {
    setState({ curCaseId: null, chatHistoryCliente: [], chatHistoryTecnico: [] });
    clearChat('cliente'); clearChat('tecnico');
  }

  const { error } = await sb.from('sek_cases').delete().eq('id', id);
  if (error) showToast('Eliminado localmente - error en nube', 'warn', 3000);

  renderChatsRecientes(); renderConversacionesList(); updateStatusBar();
  showToast('Conversación eliminada', 'ok');
}

// ─── GUARDAR HISTORIAL ────────────────────────────────────────────────────────
export async function saveCurrentCaseHistory() {
  const cur = state.cases.find(c => c.id === state.curCaseId);
  if (!cur) return;

  cur.histcliente = state.chatHistoryCliente;
  cur.histtecnico = state.chatHistoryTecnico;
  _persistCasesLocally();

  const { error } = await sb.from('sek_cases').update({
    histcliente: state.chatHistoryCliente,
    histtecnico: state.chatHistoryTecnico,
  }).eq('id', state.curCaseId);

  if (error) {
    console.error('[saveHistory] ERROR:', error.code, error.message, error.details, error.hint);
    showToast('Error guardando historial en nube', 'err', 3000);
  } else {
    console.log('[saveHistory] OK — caseId:', state.curCaseId,
      '| cliente msgs:', state.chatHistoryCliente.length,
      '| tecnico msgs:', state.chatHistoryTecnico.length);
  }
}

// ─── CAMBIAR ESTADO ───────────────────────────────────────────────────────────
export async function cambiarEstadoCaso(nuevoEstado) {
  if (!state.curCaseId) { showToast('No hay caso activo', 'err'); return; }
  const cur = state.cases.find(c => c.id === state.curCaseId);
  if (!cur) { showToast('Caso no encontrado', 'err'); return; }

  cur.estado = nuevoEstado;
  _persistCasesLocally();

  const { error } = await sb.from('sek_cases').update({ estado: nuevoEstado }).eq('id', state.curCaseId);
  if (error) showToast('Cambio local - error en nube', 'warn', 3000);
  else showToast('Estado: ' + getEstadoLabel(nuevoEstado), 'ok');

  renderChatsRecientes(); renderConversacionesList();
}

export async function cerrarCasoActual() {
  if (!state.curCaseId) { showToast('No hay caso activo', 'err'); return; }
  if (!confirm('¿Cerrar este caso?')) return;
  await cambiarEstadoCaso('cerrado');
}

// ─── NOTAS INTERNAS ───────────────────────────────────────────────────────────
export async function agregarNotaInterna() {
  if (!state.curCaseId) { showToast('No hay caso activo', 'err'); return; }
  const nota = prompt('Nota interna (solo visible para agentes):');
  if (!nota?.trim()) return;

  const cur = state.cases.find(c => c.id === state.curCaseId);
  if (!cur) return;
  if (!cur.notasInternas) cur.notasInternas = [];

  cur.notasInternas.push({
    text  : nota.trim(),
    time  : new Date().toISOString(),
    agente: state.currentAgent.email ?? 'Agente',
  });
  _persistCasesLocally();

  const { error } = await sb.from('sek_cases')
    .update({ notasInternas: cur.notasInternas })
    .eq('id', state.curCaseId);
  if (error) showToast('Nota guardada localmente', 'info');
  else showToast('Nota agregada', 'ok');

  renderNotasInternas();
}

// ─── ESCALAR A N2 ─────────────────────────────────────────────────────────────
export async function escalarAN2() {
  if (!state.curCaseId) { showToast('No hay caso activo', 'err'); return; }
  const cur = state.cases.find(c => c.id === state.curCaseId);
  if (!cur) return;

  if (!cur.tags) cur.tags = [];
  if (!cur.tags.includes('N2')) cur.tags.push('N2');
  cur.prioridad = 'alta';
  if (!cur.notasInternas) cur.notasInternas = [];
  cur.notasInternas.push({
    text  : `CASO ESCALADO A N2 por ${state.currentAgent.email} - Requiere atención de especialista`,
    time  : new Date().toISOString(),
    agente: state.currentAgent.email ?? 'Sistema',
  });
  _persistCasesLocally();

  await sb.from('sek_cases').update({ tags: cur.tags, prioridad: 'alta' }).eq('id', state.curCaseId);
  showToast('Caso escalado a N2', 'warn', 4000);
  renderChatsRecientes();

  const msgN2 = 'Permítame un momento, voy a verificar esta información con nuestro equipo especializado.';
  appendRawIAMsg(msgN2, 'cliente');
  state.chatHistoryCliente.push({ role: 'assistant', content: msgN2, time: new Date().toISOString() });
  await saveCurrentCaseHistory();
}

// ─── HELPERS PRIVADOS ─────────────────────────────────────────────────────────
function _activateCase(c) {
  setState({
    curCaseId          : c.id,
    chatHistoryCliente : c.histcliente,
    chatHistoryTecnico : c.histtecnico,
  });
  clearChat('cliente'); clearChat('tecnico');
  resetCaseData();
  renderChatsRecientes(); renderConversacionesList(); updateStatusBar();
}

function _persistCasesLocally() {
  localStorage.setItem('sek_cases', JSON.stringify(state.cases));
}

// ─── UTILIDADES EXPORTADAS ────────────────────────────────────────────────────
export function getEstadoLabel(estado) {
  return { nuevo:'Nuevo', pendiente:'Pendiente', en_proceso:'En proceso',
    resuelto:'Resuelto', cerrado:'Cerrado' }[estado] ?? 'Nuevo';
}

export function getEstadoColor(estado) {
  return { nuevo:'var(--blue)', pendiente:'var(--orange)', en_proceso:'var(--a1)',
    resuelto:'var(--ok)', cerrado:'var(--text-light)' }[estado] ?? 'var(--blue)';
}

export function getChatType(c) {
  const cli = c.histcliente?.filter(m => m.role === 'user').length ?? 0;
  const tec = c.histtecnico?.filter(m => m.role === 'user').length ?? 0;
  if (cli > 0 && tec > 0) return 'ambos';
  if (tec > 0) return 'tecnico';
  return 'cliente'; // por defecto y tiebreak → cliente
}

export function generateCaseTitle(msg) {
  if (!msg) return 'Nueva consulta';
  const words = msg.split(/\s+/).slice(0, 15).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
