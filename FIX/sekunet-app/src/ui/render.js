// ─── RENDER DE MENSAJES ───────────────────────────────────────────────────────
// Todas las funciones que tocan el DOM del chat están aquí.

import { state }    from '../state.js';
import { CAT_COLORS } from '../config.js';
import { escHtml, escJs } from '../utils.js';
import { showToast }  from './toast.js';
import { saveRespToKB } from '../features/knowledge.js';

// ─── HELPERS ──────────────────────────────────────────────────────────────────
export function hideEmpty(chat) {
  document.getElementById('empty-' + chat)?.remove();
  const c = document.getElementById('msgs-' + chat);
  if (c) { c.style.display = 'block'; c.style.visibility = 'visible'; }
}

export function clearChat(chat) {
  const c = document.getElementById('msgs-' + chat);
  if (!c) return;
  c.innerHTML = `<div class="empty-wrap" id="empty-${chat}">
    <div class="empty-glow ${chat === 'cliente' ? 'cli' : 'tec'}">${chat === 'cliente' ? '🎧' : '🔧'}</div>
    <div class="empty-title">Caso activo</div>
    <div class="empty-sub">Pegá el mensaje del ${chat === 'cliente' ? 'cliente' : 'técnico'} para continuar.</div>
  </div>`;
}

function scrollToBottom(chat) {
  const c = document.getElementById('msgs-' + chat);
  if (c) c.scrollTop = c.scrollHeight;
}

// ─── MENSAJE DEL USUARIO ──────────────────────────────────────────────────────
export function scrollToMsg(msgId, chat) {
  const chatView = document.getElementById('msgs-' + chat);
  if (!chatView) return;
  const el = chatView.querySelector(`[data-msg-id="${msgId}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.style.transition = 'background .3s';
  el.style.background = 'var(--orange-bg)';
  setTimeout(() => { el.style.background = ''; }, 1800);
}

export function appendUserMsg(msg, chat, audio) {
  hideEmpty(chat);
  const c = document.getElementById('msgs-' + chat);
  const d = document.createElement('div');
  d.className = 'msg-group msg-user';
  d.style.cssText = 'display:flex;visibility:visible';
  let inner = `<div class="msg-meta" style="text-align:right">Vos</div>
    <div class="bubble-user">${escHtml(msg)}`;
  if (audio?.dataUrl) inner += buildAudioPlayer(audio.dataUrl, audio.secs);
  inner += '</div>';
  d.innerHTML = inner;
  c.appendChild(d);
  d.offsetHeight;
  scrollToBottom(chat);
  return d;
}

export function appendUserMsgRaw(msg, chat) {
  hideEmpty(chat);
  const c = document.getElementById('msgs-' + chat);
  if (!c) return;
  const d = document.createElement('div');
  d.className = 'msg-group msg-user';
  d.style.cssText = 'display:flex;visibility:visible';
  d.innerHTML = `<div class="msg-meta" style="text-align:right">Vos
    <button class="msg-action-btn" onclick="reenviarMensaje('${escJs(msg)}')" title="Reenviar">↻</button></div>
    <div class="bubble-user">${escHtml(msg)}</div>`;
  c.appendChild(d);
  d.offsetHeight;
  scrollToBottom(chat);
}

// ─── MENSAJE IA CRUDO (para vista técnico) ────────────────────────────────────
export function appendRawIAMsg(text, chat, ragSources = [], usedSearch = false) {
  hideEmpty(chat);
  const c   = document.getElementById('msgs-' + chat);
  const d   = document.createElement('div');
  d.className = 'msg-group';
  d.style.cssText = 'display:block;visibility:visible';
  const bar = CAT_COLORS[state.curStage] ?? 'var(--a2)';

  let badges = '';
  if (ragSources.length || usedSearch || chat === 'tecnico') {
    badges = '<div class="src-badges">';
    ragSources.forEach(s => { badges += `<span class="src-badge rag">📚 ${escHtml(s)}</span>`; });
    if (usedSearch)      badges += `<span class="src-badge web">🔍 Google Search</span>`;
    if (chat === 'tecnico') badges += `<span class="src-badge web">🌐 Búsqueda técnica avanzada</span>`;
    if (state.trainData.length) badges += `<span class="src-badge chat">🧠 ${state.trainData.length} conocimientos</span>`;
    badges += '</div>';
  }

  d.innerHTML = `<div class="msg-meta" style="color:${bar}">Agente Sekunet · ${state.curStage}
    <button class="msg-action-btn" onclick="reenviarMensaje('${escJs(text)}')" title="Reenviar">↻</button></div>
    <div class="bubble-ia">${badges}
      <div style="white-space:pre-wrap">${escHtml(text)}</div>
      <button class="save-to-kb" style="margin-top:11px" onclick="saveRespToKBHandler(this,'${chat}')">💾 Guardar en base de conocimiento</button>
    </div>`;
  c.appendChild(d);
  d.offsetHeight;
  scrollToBottom(chat);
  setTimeout(() => scrollToBottom(chat), 150);
}

// ─── MENSAJE PARSEADO CLIENTE (muestra opciones R1/R2/R3) ────────────────────
export function parseAndRenderCliente(text, ragSources = [], usedSearch = false) {
  const analisis = (text.match(/ANÁLISIS:\s*(.+?)(?=\[R1\])/s) ?? [])[1]?.trim() ?? '';
  const r1 = (text.match(/\[R1\]\s*([\s\S]+?)(?=\[R2\])/)       ?? [])[1]?.trim() ?? '';
  const r2 = (text.match(/\[R2\]\s*([\s\S]+?)(?=\[R3\])/)       ?? [])[1]?.trim() ?? '';
  const r3 = (text.match(/\[R3\]\s*([\s\S]+?)(?=\[PLANTILLAS\]|\[TECNICO\]|$)/) ?? [])[1]?.trim() ?? '';
  const ptNames  = (text.match(/\[PLANTILLAS\]\s*(.+)/) ?? [])[1]?.split('|').map(s => s.trim()).filter(Boolean) ?? [];
  const techNote = (text.match(/\[TECNICO\]\s*(.+)/)    ?? [])[1]?.trim() ?? '';

  const c   = document.getElementById('msgs-cliente');
  const d   = document.createElement('div');
  d.className = 'msg-group';
  d.style.cssText = 'display:block;visibility:visible';
  const bar = CAT_COLORS[state.curStage] ?? 'var(--a2)';

  let html = `<div class="msg-meta" style="color:${bar}">Agente Sekunet · ${state.curStage}</div>
    <div class="bubble-ia">`;

  if (ragSources.length || usedSearch) {
    html += '<div class="src-badges">';
    ragSources.forEach(s => { html += `<span class="src-badge rag">📚 ${escHtml(s)}</span>`; });
    if (usedSearch) html += `<span class="src-badge web">🔍 Google Search</span>`;
    if (state.trainData.length) html += `<span class="src-badge chat">🧠 ${state.trainData.length} conocimientos</span>`;
    html += '</div>';
  }

  if (analisis) html += `<div class="ia-hd">Análisis</div><div class="ia-analysis">${escHtml(analisis)}</div>`;

  const _clean = s => s
    .replace(/\[R[123]\]/gi, '')
    .replace(/\[PLANTILLAS\][\s\S]*/i, '')
    .replace(/\[TECNICO\][\s\S]*/i, '')
    .replace(/\[ESCALAR_HUMANO\]/gi, '')
    .replace(/\[ESTADO:[^\]]*\]/gi, '')
    .replace(/\[PREGUNTA_N2\]/gi, '')
    .replace(/\[ACEPTA_N2\]/gi, '')
    .replace(/\[CIERRE_SIN_N2\]/gi, '')
    .replace(/\[DATOS_CLIENTE\][^\n\r]*/gi, '')
    .replace(/\[ESCALAR_TICKET\]/gi, '')
    .replace(/\[ESCALAR_N2\]/gi, '')
    .replace(/\[DERIVAR_VENTAS\]/gi, '')
    .trim();

  if (r1 || r2 || r3) {
    html += `<div class="ia-hd" style="margin-top:15px">Respuestas sugeridas</div><div class="suggestions">`;
    [r1, r2, r3].filter(Boolean).map(_clean).forEach((s, i) => {
      html += `<div class="sug-card">
        <div class="sug-header">
          <span class="sug-num" style="color:${bar}">Opción ${i + 1}</span>
          <div class="sug-actions">
            <button class="sug-action-btn fix" onclick="startCorrection(this)">✏️ Corregir</button>
            <button class="sug-action-btn" onclick="copySug(this.closest('.sug-card'))">Copiar</button>
          </div>
        </div>
        <div class="sug-text">${escHtml(s)}</div>
      </div>`;
    });
    html += '</div>';
  } else if (!analisis) {
    // Gemini no usó el formato esperado — mostrar respuesta completa directamente
    const cleaned = text
      .replace(/\[R[123]\]/gi, '')
      .replace(/\[PLANTILLAS\][\s\S]*/i, '')
      .replace(/\[TECNICO\][\s\S]*/i, '')
      .replace(/\[ESCALAR_HUMANO\]/gi, '')
      .replace(/\[ESTADO:[^\]]*\]/gi, '')
      .replace(/\[PREGUNTA_N2\]/gi, '')
      .replace(/\[ACEPTA_N2\]/gi, '')
      .replace(/\[CIERRE_SIN_N2\]/gi, '')
      .replace(/\[DATOS_CLIENTE\][^\n\r]*/gi, '')
      .replace(/\[ESCALAR_TICKET\]/gi, '')
      .replace(/\[ESCALAR_N2\]/gi, '')
      .replace(/\[DERIVAR_VENTAS\]/gi, '')
      .trim();
    html += `<div class="sug-card">
      <div class="sug-header">
        <span class="sug-num" style="color:${bar}">Respuesta</span>
        <div class="sug-actions">
          <button class="sug-action-btn fix" onclick="startCorrection(this)">✏️ Corregir</button>
          <button class="sug-action-btn" onclick="copySug(this.closest('.sug-card'))">Copiar</button>
        </div>
      </div>
      <div class="sug-text">${escHtml(cleaned)}</div>
    </div>`;
  }

  if (techNote) html += `<div class="tech-note"><span class="tech-note-hd">🔧 Nota técnica interna</span>${escHtml(techNote)}</div>`;

  if (ptNames.length) {
    const matched = ptNames
      .map(n => state.plantillas.find(p =>
        p.nombre.toLowerCase().includes(n.toLowerCase()) ||
        n.toLowerCase().includes(p.nombre.toLowerCase())))
      .filter(Boolean);
    if (matched.length) {
      html += `<div class="ia-hd" style="margin-top:15px">Plantillas sugeridas</div><div class="tmpl-pills">`;
      matched.forEach(p => {
        const col = CAT_COLORS[p.cat] ?? 'var(--a2)';
        html += `<button class="tmpl-pill" style="color:${col};border-color:${col};background:${col}22"
          onclick="navigator.clipboard?.writeText('${escJs(p.texto)}');showToast('Copiado','ok')">${escHtml(p.nombre)}</button>`;
      });
      html += '</div>';
    }
  }

  html += `<button class="save-to-kb" onclick="saveRespToKBHandler(this,'cliente')">💾 Guardar en base de conocimiento</button>`;
  html += '</div>';

  d.innerHTML = html;
  c.appendChild(d);
  d.offsetHeight;
  scrollToBottom('cliente');
  setTimeout(() => scrollToBottom('cliente'), 150);
}

// ─── TYPING INDICATOR ─────────────────────────────────────────────────────────
export function showTyping(chat) {
  hideEmpty(chat);
  const c = document.getElementById('msgs-' + chat);
  const d = document.createElement('div');
  d.className = 'msg-group';
  d.innerHTML = `<div class="msg-meta">Procesando…</div>
    <div class="typing-wrap"><span></span><span></span><span></span></div>`;
  c.appendChild(d);
  scrollToBottom(chat);
  return d;
}

// ─── MENSAJE DE ERROR ─────────────────────────────────────────────────────────
export function appendErrorMsg(msg, chat) {
  const c = document.getElementById('msgs-' + (chat || state.curChat));
  if (!c) return;
  const d = document.createElement('div');
  d.className = 'msg-group';
  d.innerHTML = `<div class="bubble-error">⚠️ ${escHtml(msg)}</div>`;
  c.appendChild(d);
  scrollToBottom(chat || state.curChat);
}

// ─── BADGES DE MENSAJES ───────────────────────────────────────────────────────
export function updateMsgBadges() {
  const bc = document.getElementById('badge-cliente');
  const bt = document.getElementById('badge-tecnico');
  if (bc) bc.textContent = state.chatHistoryCliente.filter(m => m.role === 'user').length;
  if (bt) bt.textContent = state.chatHistoryTecnico.filter(m => m.role === 'user').length;
}

// ─── CORRECCIÓN MANUAL ────────────────────────────────────────────────────────
export function startCorrection(btn) {
  const card = btn.closest('.sug-card');
  const text = card.querySelector('.sug-text').textContent;
  if (card.querySelector('.correction-wrap')) return;
  const div = document.createElement('div');
  div.className = 'correction-wrap';
  div.innerHTML = `<textarea>${escHtml(text)}</textarea>
    <button class="correction-save" onclick="saveManualCorrectionHandler(this,'${escJs(text)}')">Guardar corrección en conocimiento</button>`;
  card.appendChild(div);
  div.querySelector('textarea').focus();
}

// ─── AUDIO PLAYER ─────────────────────────────────────────────────────────────
export function buildAudioPlayer(dataUrl, secs) {
  const uid = 'aud_' + Date.now();
  window._audios = window._audios ?? {};
  window._audios[uid] = { dataUrl, duration: secs ?? 1, playing: false, audio: null };
  return `<div class="audio-player">
    <button class="audio-play-btn" onclick="toggleAudioPlay('${uid}')" aria-label="Reproducir">
      <svg id="playicon_${uid}" width="13" height="13" fill="#fff" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>
    </button>
    <div class="audio-waveform"><div class="audio-progress" id="prog_${uid}"></div></div>
    <span class="audio-time" id="time_${uid}">${formatTime(secs)}</span>
  </div>
  <div class="audio-label">🎤 Audio (${secs}s)</div>`;
}

export function toggleAudioPlay(uid) {
  const a = window._audios[uid]; if (!a) return;
  if (a.playing) {
    a.audio?.pause(); a.audio && (a.audio.currentTime = 0); a.playing = false;
    document.getElementById('playicon_' + uid).innerHTML = '<polygon points="5,3 19,12 5,21"/>';
    document.getElementById('prog_'     + uid).style.width = '0%';
    document.getElementById('time_'     + uid).textContent = formatTime(a.duration);
    return;
  }
  a.audio = new Audio(a.dataUrl);
  a.audio.onended = () => {
    a.playing = false;
    document.getElementById('playicon_' + uid).innerHTML = '<polygon points="5,3 19,12 5,21"/>';
    document.getElementById('prog_' + uid).style.width = '0%';
    document.getElementById('time_' + uid).textContent = formatTime(a.duration);
  };
  a.audio.ontimeupdate = () => {
    const pct = (a.audio.currentTime / a.audio.duration) * 100;
    const pe = document.getElementById('prog_' + uid); if (pe) pe.style.width = pct + '%';
    const te = document.getElementById('time_' + uid);
    if (te) te.textContent = formatTime(Math.ceil(a.audio.duration - a.audio.currentTime));
  };
  a.audio.play(); a.playing = true;
  document.getElementById('playicon_' + uid).innerHTML =
    '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
}

function formatTime(secs) {
  return Math.floor(secs / 60) + ':' + String(Math.floor(secs % 60)).padStart(2, '0');
}
