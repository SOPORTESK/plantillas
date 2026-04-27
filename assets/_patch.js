// ── Fallbacks para funciones del bundle (por si no ha cargado) ────────────
if(typeof C==='undefined')window.C=function(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;};
if(typeof y==='undefined')window.y=function(){};

async function _processDocFile(file){const ext=file.name.split('.').pop().toLowerCase();const dz=document.getElementById('drop-zone');const ta=document.getElementById('doc-content');const ni=document.getElementById('doc-name');if(ni&&!ni.value.trim())ni.value=file.name.replace(/\.[^.]+$/,'');if(dz)dz.innerHTML='<span class="dz-icon">...</span><strong>Leyendo '+C(file.name)+'...</strong>';try{let text='';if(ext==='txt'||ext==='md'||ext==='csv'){text=await file.text();}else if(ext==='docx'||ext==='doc'){if(typeof mammoth==='undefined'){y('Error: mammoth no disponible','err');if(dz)dz.innerHTML='<span class="dz-icon">doc</span><strong>Arrasta o hace clic para seleccionar</strong>';return;}const ab=await file.arrayBuffer();const res=await mammoth.extractRawText({arrayBuffer:ab});text=res.value||'';}else if(ext==='pdf'){y('Para PDF: abri el PDF, selecciona todo (Ctrl+A), copialo y pegalo en el area de texto.','info',7000);if(dz)dz.innerHTML='<span class="dz-icon">doc</span><strong>Arrasta o hace clic para seleccionar</strong> PDF - Word - Texto';return;}else{try{text=await file.text();}catch{y('Formato no reconocido. Pega el contenido manualmente.','err');if(dz)dz.innerHTML='<span class="dz-icon">doc</span><strong>Arrasta o hace clic</strong>';return;}}if(!text.trim()){y('No se pudo extraer texto del archivo','err');if(dz)dz.innerHTML='<span class="dz-icon">doc</span><strong>Arrasta o hace clic</strong>';return;}if(ta)ta.value=text.substring(0,10000);if(dz)dz.innerHTML='<span class="dz-icon">OK</span><strong>'+C(file.name)+' - '+text.length.toLocaleString()+' caracteres cargados</strong>';y('Archivo cargado - revisa el contenido y guarda','ok',4000);}catch(err){y('Error leyendo archivo: '+(err.message||err),'err');if(dz)dz.innerHTML='<span class="dz-icon">doc</span><strong>Arrasta o hace clic</strong>';}}
window.handleDropDoc=async function(t){t.preventDefault();var dz=document.getElementById('drop-zone');if(dz)dz.classList.remove('drag');var f=t.dataTransfer&&t.dataTransfer.files&&t.dataTransfer.files[0];if(f)await _processDocFile(f);};window.handleDocFile=async function(e){var f=e&&e.target&&e.target.files&&e.target.files[0];if(f)await _processDocFile(f);if(e&&e.target)e.target.value='';};

// ===== SEKUNET PREMIUM RT v5 — MutationObserver (intercepta _o() interno) =====
(function () {
  'use strict';

  // ── 1. CSS ───────────────────────────────────────────────────────────────
  const _s = document.createElement('style');
  _s.textContent = [
    '.msg-group:not(._seen){animation:_mi .22s cubic-bezier(.2,0,0,1) both}',
    '@keyframes _mi{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
    '.msg-group._seen{animation:none!important;opacity:1!important;transform:none!important}',
    '.date-separator{text-align:center;font-size:12px;margin:14px 0 6px;padding:4px 0;',
    'background:rgba(0,0,0,.03);border-radius:4px;font-weight:600;letter-spacing:.3px}',
    '.msg-time{font-size:11px;text-align:right;margin-top:4px;font-weight:500;opacity:.62}',
  ].join('');
  document.head.appendChild(_s);

  // ── 2. Notificaciones de escritorio ─────────────────────────────────────
  if (window.isSecureContext && typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  function _notify(body) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      const n = new Notification('SEKUNET — Mensaje entrante', {
        body: body.substring(0, 120),
        icon: '/favicon.ico',
        tag: 'sek-wa',
        renotify: true,
      });
      n.onclick = () => { window.focus(); n.close(); };
    } catch (e) {}
  }

  // ── 3. Contador no leídos en pestaña ────────────────────────────────────
  let _unread = 0;
  const _baseTitle = document.title || 'SEKUNET';
  function _incUnread() { document.title = '(' + (++_unread) + ') ' + _baseTitle; }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { _unread = 0; document.title = _baseTitle; }
  });

  // ── 4. Timestamps estilo WhatsApp (solo chat cliente) ────────────────────
  const _fD = d => d.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });
  const _fT = d => d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });

  function _applyTimestamps(container, history) {
    if (!container || !history || !history.length) return;
    container.querySelectorAll('.date-separator, .msg-time').forEach(el => el.remove());
    let lastDate = null;
    container.querySelectorAll('.msg-group').forEach((bubble, idx) => {
      const msg = history[idx];
      if (!msg || !msg.time) return;
      const d = new Date(msg.time);
      const ds = _fD(d);
      if (ds !== lastDate) {
        const sep = document.createElement('div');
        sep.className = 'date-separator';
        sep.textContent = ds;
        container.insertBefore(sep, bubble);
        lastDate = ds;
      }
      const td = document.createElement('div');
      td.className = 'msg-time';
      td.textContent = _fT(d);
      const bc = bubble.querySelector('.bubble-user,.bubble-ia');
      if (bc) bc.appendChild(td);
      bubble.dataset.msgtime = msg.time;
    });
  }

  // ── 5. MutationObserver — anti-parpadeo sin depender de window.loadCase ───
  // La app llama _o() directo desde cases-live, sin pasar por window.loadCase.
  // El único punto de intercepción fiable es el DOM mismo.
  //
  // Estrategia:
  //  • Observamos childList en msgs-cliente y msgs-tecnico.
  //  • Cuando el chat se re-renderiza, el observer llama a _onMutation().
  //  • Comparamos cada mensaje contra _seenKeys (Set de "caseId:msgTime").
  //  • Mensajes ya vistos → ._seen (sin animación).
  //  • Mensajes nuevos  → sin ._seen (slide-in CSS).
  //  • Cambio de caso   → todos marcados ._seen (no queremos 20 slides a la vez).

  const _seenKeys = new Set(); // "caseId:msgTime"
  let _curCaseId  = null;
  let _busy       = false;   // re-entry guard (applyTimestamps inserta nodos)

  function _markMessages(container, hist, caseId, forceAllSeen) {
    if (!container || !hist) return;
    container.querySelectorAll('.msg-group').forEach((b, i) => {
      const t = hist[i] && hist[i].time;
      if (!t) { b.classList.add('_seen'); return; }
      const key = caseId + ':' + t;
      if (forceAllSeen || _seenKeys.has(key)) {
        b.classList.add('_seen');
        _seenKeys.add(key);
      } else {
        _seenKeys.add(key); // marca como visto para la próxima vez
        // sin ._seen → la animación CSS se activa
      }
    });
  }

  function _onMutation(mutations) {
    if (_busy) return;
    // Solo nos interesa cuando se agregan .msg-group o .empty-wrap (re-render del chat).
    // Ignoramos .date-separator y .msg-time que agrega _applyTimestamps.
    const relevant = mutations.some(m =>
      Array.from(m.addedNodes).some(n =>
        n.nodeType === 1 &&
        (n.classList.contains('msg-group') || n.classList.contains('empty-wrap') || (n.id && n.id.startsWith('empty-')))
      )
    );
    if (!relevant) return;

    const state = window.getState && window.getState();
    if (!state || !state.curCaseId) return;

    const caseId     = state.curCaseId;
    const isSameCase = caseId === _curCaseId;
    if (!isSameCase) {
      _curCaseId = caseId;
      _subscribeCase(caseId);
    }

    _busy = true;
    try {
      const cC = document.getElementById('msgs-cliente');
      const cT = document.getElementById('msgs-tecnico');
      // Cambio de caso: todos silenciados. Mismo caso: solo nuevos animan.
      _markMessages(cC, state.chatHistoryCliente, caseId, !isSameCase);
      _markMessages(cT, state.chatHistoryTecnico, caseId, !isSameCase);
      if (state.chatHistoryCliente) _applyTimestamps(cC, state.chatHistoryCliente);
      // Scroll al último mensaje solo en actualización del mismo caso
      if (isSameCase && cC) cC.scrollTop = cC.scrollHeight;
    } finally {
      _busy = false;
    }
  }

  // ── 6. Suscripción Supabase — notificaciones de escritorio ───────────────
  let _ch = null, _subId = null;

  function _subscribeCase(caseId) {
    const sb = window.k || window.supabase;
    if (!sb || _subId === caseId) return;
    if (_ch) { try { sb.removeChannel(_ch); } catch (e) {} _ch = null; }
    _subId = caseId;
    if (!caseId) return;
    _ch = sb.channel('_sek_' + caseId)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'sek_cases',
        filter: 'id=eq.' + caseId,
      }, payload => {
        const hist = (payload.new || {}).histcliente || [];
        const cC = document.getElementById('msgs-cliente');
        const rendered = new Set(
          Array.from(cC ? cC.querySelectorAll('[data-msgtime]') : []).map(el => el.dataset.msgtime)
        );
        const incoming = hist.filter(m => m.role === 'user' && m.time && !rendered.has(m.time));
        if (incoming.length && document.hidden) {
          _notify(incoming[incoming.length - 1].content);
          _incUnread();
        }
      })
      .subscribe();
  }

  // ── 7. Arranque ──────────────────────────────────────────────────────────
  function _startObserver() {
    const cC = document.getElementById('msgs-cliente');
    const cT = document.getElementById('msgs-tecnico');
    if (!cC || !cT) { setTimeout(_startObserver, 400); return; }

    // Seed: marcar mensajes ya mostrados como vistos antes de arrancar el observer
    const state = window.getState && window.getState();
    if (state && state.curCaseId) {
      _curCaseId = state.curCaseId;
      (state.chatHistoryCliente || []).forEach(m => {
        if (m.time) _seenKeys.add(state.curCaseId + ':' + m.time);
      });
      (state.chatHistoryTecnico || []).forEach(m => {
        if (m.time) _seenKeys.add(state.curCaseId + ':' + m.time);
      });
      _subscribeCase(state.curCaseId);
    }

    const obs = new MutationObserver(_onMutation);
    obs.observe(cC, { childList: true });
    obs.observe(cT, { childList: true });
    console.log('[Premium v5] MutationObserver activo — WhatsApp-mode ON');
  }

  setTimeout(_startObserver, 1500);
})();
