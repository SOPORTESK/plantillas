// ─── PANEL DERECHO — INFORMACIÓN DEL CLIENTE ─────────────────────────────────
// Muestra en tiempo real: datos del cliente, archivos/audios/docs/enlaces
// compartidos durante la conversación, en orden cronológico.

import { state } from '../state.js';
import { scrollToMsg } from './render.js';

// Registro cronológico — se sincroniza con state.curCase.mediaLog
let _files = [];

// ─── RENDER PRINCIPAL ─────────────────────────────────────────────────────────
export function renderClientePanel() {
  const d = state.clienteData;
  const tieneNombre = !!d.nombre;

  // Avatar y nombre
  const avatar = document.getElementById('ip-avatar');
  const name   = document.getElementById('ip-name');
  const sub    = document.getElementById('ip-sub');
  const badge  = document.getElementById('ip-estado-badge');

  if (avatar) avatar.textContent = tieneNombre ? d.nombre.charAt(0).toUpperCase() : '?';
  if (name)   name.textContent   = d.nombre  || 'Sin identificar';

  // Sub: cuenta o ticket
  const eq = state.equipoData;
  const tieneEquipo = !!(eq.modelo || eq.marca);
  const camposFaltantes = [
    !d.nombre   && 'nombre',
    !d.telefono && 'teléfono',
    !d.correo   && 'correo',
    !d.cuenta   && 'cuenta',
    !tieneEquipo && 'equipo',
  ].filter(Boolean);
  if (sub) sub.textContent = camposFaltantes.length
    ? `Pendiente: ${camposFaltantes.join(', ')}`
    : 'Datos completos ✓';

  // Badge de estado
  if (badge) {
    const completo = d.nombre && d.telefono && d.correo && d.cuenta && tieneEquipo;
    badge.textContent  = completo ? 'Completo' : 'Incompleto';
    badge.className    = 'ip-badge ' + (completo ? 'ok' : 'pending');
  }

  // Campos individuales
  _setField('ip-telefono', 'ipf-telefono', d.telefono);
  _setField('ip-correo',   'ipf-correo',   d.correo);
  _setField('ip-cuenta',   'ipf-cuenta',   d.cuenta);
  _setField('ip-ticket',   'ipf-ticket',   d.ticket);

  // Equipo
  const eqD = state.equipoData;
  _setField('ip-tipo-equipo',  'ipf-tipo-equipo',  eqD.tipo  || null);
  _setField('ip-marca-equipo', 'ipf-marca-equipo',
    eqD.marca && eqD.modelo ? `${eqD.marca} ${eqD.modelo}` : eqD.modelo || eqD.marca || null);
}

function _setField(valId, fieldId, valor) {
  const val   = document.getElementById(valId);
  const field = document.getElementById(fieldId);
  if (!val || !field) return;
  if (valor) {
    val.textContent = valor;
    val.classList.remove('empty');
    field.classList.add('filled');
  } else {
    val.textContent = '—';
    val.classList.add('empty');
    field.classList.remove('filled');
  }
}

// ─── REGISTRAR ARCHIVO COMPARTIDO ─────────────────────────────────────────────
export function registrarArchivo({ nombre, tipo, url, mime, origen, time, msgId, chat }) {
  const entry = { nombre, tipo, url, mime, origen: origen || 'cliente', time: time || new Date().toISOString(), msgId: msgId || null, chat: chat || 'cliente' };
  _files.push(entry);
  // Persistir en el caso activo
  const cur = state.cases.find(c => c.id === state.curCaseId);
  if (cur) {
    if (!cur.mediaLog) cur.mediaLog = [];
    cur.mediaLog.push(entry);
  }
  _renderFiles();
}

function _renderFiles() {
  const list  = document.getElementById('ip-files-list');
  const count = document.getElementById('ip-files-count');
  if (!list) return;

  if (count) count.textContent = _files.length;

  if (!_files.length) {
    list.innerHTML = '<div class="ip-empty">No hay archivos compartidos aún</div>';
    return;
  }

  // Orden cronológico inverso (más reciente primero)
  list.innerHTML = [..._files].reverse().map((f) => {
    const { icon, cls } = _tipoIcon(f.tipo, f.mime);
    const hora = new Date(f.time).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
    const origenLabel = f.origen === 'agente' ? '🤖 Agente' : '👤 Cliente';
    const hasLink = !!f.url;
    const hasMsgId = !!f.msgId;
    return `
      <div class="ip-file${hasMsgId ? ' ip-file-jump' : ''}" 
        title="${hasMsgId ? 'Ver en el chat' : hasLink ? 'Abrir enlace' : ''}"
        data-msg-id="${f.msgId || ''}" data-chat="${f.chat || 'cliente'}" data-url="${f.url || ''}">
        <div class="ip-file-icon ${cls}">${icon}</div>
        <div class="ip-file-body">
          <div class="ip-file-name" title="${f.nombre}">${f.nombre}</div>
          <div class="ip-file-meta">${origenLabel} · ${hora}${hasMsgId ? ' · <span style="color:var(--blue)">↗ Ver en chat</span>' : ''}</div>
        </div>
      </div>`;
  }).join('');

  // Eventos click
  list.querySelectorAll('.ip-file').forEach(el => {
    el.addEventListener('click', () => {
      const mid  = el.dataset.msgId;
      const ch   = el.dataset.chat;
      const url  = el.dataset.url;
      if (mid) {
        window.switchChat?.(ch);
        setTimeout(() => scrollToMsg(mid, ch), 80);
      } else if (url) {
        window.open(url, '_blank');
      }
    });
  });
}

function _tipoIcon(tipo, mime) {
  if (tipo === 'imagen' || mime?.startsWith('image/'))  return { icon: '🖼️', cls: 'img' };
  if (tipo === 'audio'  || mime?.startsWith('audio/'))  return { icon: '🎤', cls: 'aud' };
  if (tipo === 'enlace')                                 return { icon: '🔗', cls: 'lnk' };
  return { icon: '📄', cls: 'doc' };
}

// ─── RESET AL CAMBIAR DE CASO — carga mediaLog guardado ──────────────────────
export function resetClientePanel() {
  const cur = state.cases.find(c => c.id === state.curCaseId);
  _files = cur?.mediaLog ? [...cur.mediaLog] : [];
  renderClientePanel();
  _renderFiles();
}
