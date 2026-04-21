// ─── SEND MESSAGE ─────────────────────────────────────────────────────────────

import { state, setState, resetCaseData } from '../state.js';
import { showToast }           from '../ui/toast.js';
import { appendUserMsg, appendRawIAMsg, parseAndRenderCliente, appendErrorMsg, showTyping, updateMsgBadges, clearChat, appendUserMsgRaw, scrollToMsg } from '../ui/render.js';
import { callGeminiWithFallback } from '../api/gemini.js';
import { searchRAG }             from '../api/gemini.js';
import { saveCurrentCaseHistory, generateCaseTitle } from './cases.js';
import { extraerDatosCliente, extraerDatosEquipo }   from './dataExtractor.js';
import { renderChatsRecientes, renderConversacionesList } from '../ui/sidebar.js';
import { updateStatusBar }       from '../ui/statusBar.js';
import { switchChat as _switchChat } from '../ui/chatSwitch.js';
import { sb }                    from '../db/supabase.js';
import { genId, formatDate }     from '../utils.js';
import { GEMINI_MODELS, STAGE_NAMES } from '../config.js';
import { buildPromptCliente, buildPromptTecnico }  from '../api/prompts.js';
import { registrarArchivo, renderClientePanel } from '../ui/clientePanel.js';
import { getAgentesDisponibles, setAgentStatus } from '../ui/presence.js';

// switchChat vive en ui/chatSwitch.js — lo re-exportamos para compatibilidad
export { switchChat } from '../ui/chatSwitch.js';

export function updateChatTitles() {
  const title    = document.getElementById('chat-title');
  const subtitle = document.getElementById('chat-subtitle');
  if (!title || !subtitle) return;

  if (state.curChat === 'tecnico') {
    if (state.equipoData.modelo) {
      title.textContent    = `🔧 ${state.equipoData.marca ?? ''} ${state.equipoData.modelo}`;
      subtitle.textContent = `${state.equipoData.tipo ?? 'Equipo'} · ${STAGE_NAMES[state.curStage]}`;
    } else {
      title.textContent    = 'Chat Técnico';
      subtitle.textContent = 'Consultas técnicas especializadas';
    }
  } else {
    const cn = state.clienteData.nombre;
    const eq = state.equipoData;
    if (cn) {
      title.textContent = cn;
      subtitle.textContent = eq.modelo
        ? `${eq.marca ?? ''} ${eq.modelo} · ${eq.tipo ?? 'Equipo'}`.trim()
        : state.clienteData.cuenta
          ? `Cuenta: ${state.clienteData.cuenta}`
          : 'Chat con cliente';
    } else {
      title.textContent    = 'Soporte al Cliente';
      subtitle.textContent = eq.modelo ? `${eq.marca ?? ''} ${eq.modelo}`.trim() : 'Respuestas para clientes';
    }
  }
}

// ─── ENVIAR MENSAJE ────────────────────────────────────────────────────────────
export async function sendMessage(chat) {
  const inp     = document.getElementById('input-' + chat);
  const msg     = inp.value.trim();
  const side    = chat === 'cliente' ? 'cli' : 'tec';
  const hasMedia = state.attachedImg[side] || state.attachedAud[side] || state.attachedDoc[side];
  if (!msg && !hasMedia) return;

  // Si el modo IA está cerrado/pausado o el sistema está en modo manual → solo guardar msg
  if (chat === 'cliente' && (state.modoIA !== 'activo' || state.modoManual)) {
    const history = state.chatHistoryCliente;
    appendUserMsg(msg, 'cliente');
    history.push({ role: 'user', content: msg, time: new Date().toISOString() });
    if (state.curCaseId) await saveCurrentCaseHistory();
    return;
  }

  // Crear caso automáticamente si no hay uno activo
  if (!state.curCaseId) {
    await _autoCreateCase(msg, chat);
  }

  inp.value = '';
  if (state.curChat !== chat) _switchChat(chat);

  const history     = chat === 'cliente' ? state.chatHistoryCliente : state.chatHistoryTecnico;
  const displayMsg  = msg
    + (state.attachedImg[side] ? ' 📷' : '')
    + (state.attachedAud[side] ? ' 🎤' : '')
    + (state.attachedDoc[side] ? ` 📄 [${state.attachedDoc[side].name}]` : '');

  const msgId = (state.attachedImg[side] || state.attachedAud[side] || state.attachedDoc[side])
    ? 'msg_' + Date.now()
    : null;
  const lastMsg = appendUserMsg(displayMsg, chat, state.attachedAud[side]);
  if (msgId && lastMsg) lastMsg.dataset.msgId = msgId;
  history.push({ role: 'user', content: msg || '[Adjunto]', time: new Date().toISOString() });
  updateMsgBadges();

  if (chat === 'cliente' && msg) extraerDatosCliente(msg);
  else if (chat === 'tecnico' && msg) extraerDatosEquipo(msg);

  // Reiniciar timer de inactividad con cada mensaje del cliente
  if (chat === 'cliente') _resetInactivityTimer();

  if (state.curCaseId) await saveCurrentCaseHistory();

  const sendBtn = document.getElementById('send-' + side);
  if (sendBtn) sendBtn.disabled = true;
  const typEl = showTyping(chat);

  // Capturar y limpiar adjuntos
  const imgS = state.attachedImg[side];
  const audS = state.attachedAud[side];
  const docS = state.attachedDoc[side];
  state.attachedImg[side] = null;
  state.attachedAud[side] = null;
  state.attachedDoc[side] = null;

  // Registrar adjuntos en el panel de info del cliente
  const origen = chat === 'cliente' ? 'cliente' : 'agente';
  if (imgS) registrarArchivo({ nombre: imgS.name || 'Imagen', tipo: 'imagen', mime: imgS.mimeType, origen, msgId, chat });
  if (audS) registrarArchivo({ nombre: audS.name || 'Audio', tipo: 'audio', mime: audS.mimeType, origen, msgId, chat });
  if (docS) registrarArchivo({ nombre: docS.name || 'Documento', tipo: 'documento', origen, msgId, chat });

  // RAG
  const ragChunks  = msg ? await searchRAG(msg, 5) : [];
  const ragSources = ragChunks.map(r => r.doc_name).filter((v, i, a) => a.indexOf(v) === i);

  // Construir prompt
  const sys = chat === 'cliente'
    ? buildPromptCliente(ragChunks, docS)
    : buildPromptTecnico(ragChunks, docS);

  const gemHistory = history.slice(0, -1).map(m => ({
    role : m.role === 'assistant' ? 'model' : m.role,
    parts: [{ text: m.content }],
  }));

  const lastParts = [];
  if (imgS)      { lastParts.push({ inline_data: { mime_type: imgS.mimeType, data: imgS.base64 } }); lastParts.push({ text: (msg || '') + ' [Imagen adjunta — analizala en contexto de seguridad electrónica.]' }); }
  else if (audS) { lastParts.push({ inline_data: { mime_type: audS.mimeType, data: audS.base64 } }); lastParts.push({ text: (msg || '') + ' [Audio — transcribí y respondé según corresponda.]' }); }
  else           { lastParts.push({ text: history.at(-1).content }); }

  const payload = {
    system_instruction: { parts: [{ text: sys }] },
    contents          : [...gemHistory, { role: 'user', parts: lastParts }],
    generationConfig  : { maxOutputTokens: 1400, temperature: state._temperature ?? 0.4 },
    tools             : [{ google_search: {} }],
  };

  try {
    const data       = await callGeminiWithFallback(payload);

    // ─── Retraso humano: solo en chat cliente (el técnico no lo necesita) ───
    const _parts     = data.candidates?.[0]?.content?.parts ?? [];
    if (chat === 'cliente') {
      const _respLen = _parts.map(p => p.text ?? '').join('').length;
      const _delay   = Math.min(5000, Math.max(1500, _respLen * 12 + Math.random() * 1500));
      await new Promise(r => setTimeout(r, _delay));
    }

    typEl?.remove();
    const parts      = _parts;
    console.log('[Gemini] finishReason:', data.candidates?.[0]?.finishReason, '| parts:', parts.length, '| error:', data.error?.message);
    const text       = parts.map(p => p.text ?? '').join('').trim() || 'Sin respuesta';
    const usedSearch = parts.some(p => p.executableCode) || (data.candidates?.[0]?.groundingMetadata?.searchEntryPoint != null);

    history.push({ role: 'assistant', content: text, time: new Date().toISOString() });
    if (state.curCaseId) await saveCurrentCaseHistory();

    if (chat === 'cliente') {
      // Capturar y aplicar bloque de datos normalizados por Gemini ANTES de renderizar
      _aplicarDatosClienteNormalizados(text);

      parseAndRenderCliente(text, ragSources, usedSearch);

      // Capturar estado emitido por Gemini
      const estadoMatch = text.match(/\[ESTADO:\s*(nuevo|pendiente|en_proceso|resuelto|cerrado)\]/i);
      if (estadoMatch && state.curCaseId) {
        _actualizarEstadoCaso(estadoMatch[1].toLowerCase());
      }

      // Contador de intentos fallidos de datos
      const tieneNombre = !!state.clienteData.nombre;
      const tieneEquipo = !!(state.equipoData.modelo || state.equipoData.marca);
      if (!tieneNombre || !tieneEquipo) {
        setState({ intentosDatosCliente: (state.intentosDatosCliente ?? 0) + 1 });
      } else {
        setState({ intentosDatosCliente: 0 });
      }

      // Flujo de transferencia N2
      if (text.includes('[PREGUNTA_N2]')) {
        setState({ esperandoRespN2: true });
      }
      if (text.includes('[ACEPTA_N2]')) {
        setState({ modoIA: 'cerrado', esperandoRespN2: false });
        await _notificarEscalamientoN2();
        _renderModoIA();
      }
      if (text.includes('[CIERRE_SIN_N2]')) {
        setState({ modoIA: 'cerrado', esperandoRespN2: false });
        await _actualizarEstadoCaso('cerrado');
        _renderModoIA();
      }

      // Legado: [ESCALAR_HUMANO] directo
      if (text.includes('[ESCALAR_HUMANO]')) {
        _mostrarAlertaEscalamiento();
      }

    } else {
      appendRawIAMsg(text, 'tecnico', ragSources, usedSearch);
    }

    // Detectar y registrar enlaces en la respuesta del agente
    const urlMatches = text.match(/https?:\/\/[^\s)\]>"]+/g);
    if (urlMatches) {
      urlMatches.forEach(url => {
        const nombre = url.replace(/^https?:\/\//, '').split('/')[0];
        registrarArchivo({ nombre, tipo: 'enlace', url, origen: 'agente', chat });
      });
    }

    updateMsgBadges();
  } catch (err) {
    typEl?.remove();
    console.error('[sendMessage] error:', err);
    appendErrorMsg('Error: ' + err.message, chat);
    history.pop();
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

// ─── HELPER PRIVADO: aplicar datos normalizados emitidos por Gemini ──────────
function _aplicarDatosClienteNormalizados(text) {
  const m = text.match(/\[DATOS_CLIENTE\]([^\n\r]*)/i);
  if (!m) return;
  const pairs = m[1].split(';').map(s => s.trim()).filter(Boolean);
  const d = { ...state.clienteData };
  let changed = false;
  for (const p of pairs) {
    const [k, ...rest] = p.split('=');
    const key = (k || '').trim().toLowerCase();
    const val = rest.join('=').trim().replace(/^["']|["']$/g, '');
    if (!val || /^<.*>$/.test(val)) continue;
    const map = { nombre:'nombre', telefono:'telefono', 'teléfono':'telefono',
                  correo:'correo', email:'correo', cuenta:'cuenta', ticket:'ticket' };
    const field = map[key];
    if (!field) continue;
    let clean = val;
    if (field === 'correo')   clean = clean.toLowerCase();
    if (field === 'telefono') clean = clean.replace(/[\s.\-()]/g, '');
    if (field === 'nombre' || field === 'cuenta') clean = clean.replace(/\s+/g, ' ').trim();
    if (clean && d[field] !== clean) { d[field] = clean; changed = true; }
  }
  if (changed) {
    setState({ clienteData: d });
    updateChatTitles();
    renderClientePanel();
  }
}

// ─── HELPER PRIVADO: crear caso automático ────────────────────────────────────
async function _autoCreateCase(msg, chat) {
  const id    = genId();
  const title = generateCaseTitle(msg);
  const c = {
    id, title, cat: state.curStage ?? 'apertura', date: formatDate(),
    estado: 'nuevo', canal: 'web', prioridad: 'normal',
    cliente: { nombre:'', telefono:'', email:'' },
    tags: [], notasInternas: [], histcliente: [], histtecnico: [],
  };
  const { error } = await sb.from('sek_cases').insert({
    id, title, cat: c.cat, date: c.date, histcliente: [], histtecnico: [],
  });
  if (error) console.error('Auto-caso error:', error);
  state.cases.unshift(c);
  clearInactivityTimer();
  setState({
    curCaseId          : id,
    chatHistoryCliente : c.histcliente ?? [],
    chatHistoryTecnico : c.histtecnico ?? [],
  });
  resetCaseData();
  renderChatsRecientes(); renderConversacionesList(); updateStatusBar();
}

export function handleKey(e, chat) {
  if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey || e.shiftKey)) {
    e.preventDefault();
    sendMessage(chat);
  }
}

// ─── ACTUALIZAR ESTADO DEL CASO ───────────────────────────────────────────────
async function _actualizarEstadoCaso(nuevoEstado) {
  const cur = state.cases.find(c => c.id === state.curCaseId);
  if (!cur || cur.estado === nuevoEstado) return;
  cur.estado = nuevoEstado;
  renderChatsRecientes();
  renderConversacionesList();
  await sb.from('sek_cases').update({ estado: nuevoEstado }).eq('id', state.curCaseId);
}

// ─── CIERRE POR INACTIVIDAD / IMPASSE ─────────────────────────────────────────
async function _cerrarCasoInactividad(nota = 'Caso cerrado por inactividad — sin respuesta del cliente.') {
  if (!state.curCaseId) return;
  const cur = state.cases.find(c => c.id === state.curCaseId);
  if (!cur) return;

  cur.estado = 'cerrado';
  if (!cur.notasInternas) cur.notasInternas = [];
  cur.notasInternas.push({
    text  : nota,
    time  : new Date().toISOString(),
    agente: 'Sistema',
  });

  await sb.from('sek_cases').update({
    estado        : 'cerrado',
    notasInternas : cur.notasInternas,
  }).eq('id', state.curCaseId);

  showToast('Caso cerrado por inactividad', 'warn', 5000);
  renderChatsRecientes();
  renderConversacionesList();
}

// ─── TIMER DE INACTIVIDAD (5 minutos) ─────────────────────────────────────────
const INACTIVITY_MS = 5 * 60 * 1000; // 5 minutos

function _resetInactivityTimer() {
  if (state._inactivityTimer) clearTimeout(state._inactivityTimer);
  if (!state.curCaseId) return;

  state._inactivityTimer = setTimeout(async () => {
    const cur = state.cases.find(c => c.id === state.curCaseId);
    if (!cur || cur.estado === 'cerrado' || cur.estado === 'resuelto') return;
    await _cerrarCasoInactividad('Caso cerrado automáticamente: el cliente no respondió en los últimos 5 minutos.');
  }, INACTIVITY_MS);
}

export function clearInactivityTimer() {
  if (state._inactivityTimer) { clearTimeout(state._inactivityTimer); state._inactivityTimer = null; }
}

// ─── NOTIFICACIÓN DE ESCALAMIENTO A N2 ────────────────────────────────────────
async function _notificarEscalamientoN2() {
  const disponibles = getAgentesDisponibles();
  const cur = state.cases.find(c => c.id === state.curCaseId);

  if (!cur.notasInternas) cur.notasInternas = [];
  cur.notasInternas.push({
    text  : `TRANSFERENCIA N2: El cliente aceptó ser atendido por un asesor de Nivel 2. La IA ha finalizado su participación en este caso.`,
    time  : new Date().toISOString(),
    agente: 'Sistema',
  });
  if (!cur.tags) cur.tags = [];
  if (!cur.tags.includes('N2')) cur.tags.push('N2');
  cur.estado = 'pendiente';

  await sb.from('sek_cases').update({
    estado       : 'pendiente',
    tags         : cur.tags,
    notasInternas: cur.notasInternas,
  }).eq('id', state.curCaseId);

  const agN2label = disponibles.length > 0 ? (disponibles[0].nombre || disponibles[0].email) : 'Sin asignar';
  if (disponibles.length > 0) {
    showToast(`🔔 Caso transferido a N2 — ${agN2label} notificado`, 'warn', 8000);
  } else {
    showToast('⚠️ Transferencia N2 solicitada — sin agentes disponibles ahora', 'warn', 8000);
  }
  // Notificación nativa vía Electron si está disponible
  if (window.electronAPI?.notificarN2) {
    window.electronAPI.notificarN2({
      cliente  : state.clienteData.nombre  || 'Cliente no identificado',
      telefono : state.clienteData.telefono || '—',
      agente   : agN2label,
    });
  }

  const panel = document.getElementById('notas-internas-panel');
  if (panel) {
    const hora      = new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
    const cliente   = state.clienteData.nombre || 'Cliente no identificado';
    const telefono  = state.clienteData.telefono || '—';
    const equipo    = [state.equipoData.marca, state.equipoData.modelo].filter(Boolean).join(' ') || '—';
    const agN2      = disponibles.length > 0
      ? `<span style="color:#4ade80;font-weight:700">${disponibles[0].nombre || disponibles[0].email}</span>`
      : `<span style="color:#f87171;font-weight:700">Sin agentes disponibles</span>`;

    const nota = document.createElement('div');
    nota.style.cssText = `
      background:linear-gradient(135deg,#0f2d4a 0%,#1e3a5f 100%);
      border:2px solid #3b82f6;border-radius:12px;
      padding:0;margin:10px 0;overflow:hidden;
      box-shadow:0 4px 20px rgba(59,130,246,.3);
    `;
    nota.innerHTML = `
      <div style="background:#1d4ed8;padding:10px 16px;display:flex;align-items:center;gap:10px">
        <span style="font-size:18px">🔔</span>
        <span style="color:#fff;font-size:13px;font-weight:800;letter-spacing:.5px">TRANSFERENCIA A NIVEL 2</span>
        <span style="margin-left:auto;color:#bfdbfe;font-size:11px">${hora}</span>
      </div>
      <div style="padding:14px 16px;display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;font-size:12px">
        <div>
          <div style="color:#93c5fd;font-size:10px;text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px">Cliente</div>
          <div style="color:#e2e8f0;font-weight:600">${cliente}</div>
        </div>
        <div>
          <div style="color:#93c5fd;font-size:10px;text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px">Teléfono</div>
          <div style="color:#e2e8f0;font-weight:600">${telefono}</div>
        </div>
        <div>
          <div style="color:#93c5fd;font-size:10px;text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px">Equipo</div>
          <div style="color:#e2e8f0;font-weight:600">${equipo}</div>
        </div>
        <div>
          <div style="color:#93c5fd;font-size:10px;text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px">Asignado a</div>
          <div>${agN2}</div>
        </div>
      </div>
      <div style="padding:0 16px 14px;font-size:12px;color:#94a3b8;border-top:1px solid #1e3a5f;padding-top:10px">
        El cliente aceptó la transferencia. La IA finalizó su participación.
        Use <strong style="color:#60a5fa">"▶ Reanudar IA"</strong> si necesita reactivarla.
      </div>`;
    panel.style.display = 'block';
    panel.prepend(nota);
  }

  renderChatsRecientes();
  renderConversacionesList();
}

// ─── RENDER INDICADOR DE MODO IA ──────────────────────────────────────────────
function _renderModoIA() {
  const bar = document.getElementById('modo-ia-bar');
  if (!bar) return;
  const modo = state.modoIA;
  if (modo === 'activo') {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  bar.innerHTML = modo === 'cerrado'
    ? `<span>🔴 IA finalizada en este caso</span>
       <button class="ia-resume-btn" onclick="reanudarIA()">▶ Reanudar IA</button>`
    : `<span>⏸️ IA pausada</span>
       <button class="ia-resume-btn" onclick="reanudarIA()">▶ Reanudar IA</button>`;
}

export function reanudarIA() {
  setState({ modoIA: 'activo', esperandoRespN2: false, intentosDatosCliente: 0 });
  _renderModoIA();
  showToast('▶ Agente IA reactivado', 'ok', 3000);
  const cur = state.cases.find(c => c.id === state.curCaseId);
  if (cur) {
    if (!cur.notasInternas) cur.notasInternas = [];
    cur.notasInternas.push({
      text  : `IA reactivada por ${state.currentAgent.email ?? 'agente'}`,
      time  : new Date().toISOString(),
      agente: state.currentAgent.email ?? 'Sistema',
    });
    sb.from('sek_cases').update({ notasInternas: cur.notasInternas }).eq('id', state.curCaseId);
  }
}

// ─── ALERTA DE ESCALAMIENTO A HUMANO ─────────────────────────────────────────
function _mostrarAlertaEscalamiento() {
  showToast('⚠️ El cliente requiere atención humana — impasse detectado', 'warn', 8000);

  const panel = document.getElementById('notas-internas-panel');
  if (panel) {
    const nota = document.createElement('div');
    nota.style.cssText = 'background:#3D1F00;border:1.5px solid #92400E;border-radius:8px;padding:10px 14px;margin:8px 0;font-size:13px;color:#FBB55A;font-weight:600;display:flex;align-items:center;gap:8px';
    nota.innerHTML = `<span>⚠️</span><span>IMPASSE: El agente IA solicitó escalar este caso a un asesor humano. El cliente no ha proporcionado los datos necesarios tras múltiples intentos.</span>`;
    panel.style.display = 'block';
    panel.prepend(nota);
  }

  if (state.curCaseId) {
    const cur = state.cases.find(c => c.id === state.curCaseId);
    if (cur) {
      if (!cur.tags) cur.tags = [];
      if (!cur.tags.includes('escalar')) cur.tags.push('escalar');
      if (!cur.notasInternas) cur.notasInternas = [];
      cur.notasInternas.push({
        text  : 'IMPASSE: El agente IA no pudo obtener los datos del cliente tras 3 intentos. Se solicitó escalamiento a asesor humano.',
        time  : new Date().toISOString(),
        agente: 'Sistema',
      });
    }
  }
}
