async function _processDocFile(file){const ext=file.name.split('.').pop().toLowerCase();const dz=document.getElementById('drop-zone');const ta=document.getElementById('doc-content');const ni=document.getElementById('doc-name');if(ni&&!ni.value.trim())ni.value=file.name.replace(/\.[^.]+$/,'');if(dz)dz.innerHTML='<span class="dz-icon">...</span><strong>Leyendo '+C(file.name)+'...</strong>';try{let text='';if(ext==='txt'||ext==='md'||ext==='csv'){text=await file.text();}else if(ext==='docx'||ext==='doc'){if(typeof mammoth==='undefined'){y('Error: mammoth no disponible','err');if(dz)dz.innerHTML='<span class="dz-icon">doc</span><strong>Arrasta o hace clic para seleccionar</strong>';return;}const ab=await file.arrayBuffer();const res=await mammoth.extractRawText({arrayBuffer:ab});text=res.value||'';}else if(ext==='pdf'){y('Para PDF: abri el PDF, selecciona todo (Ctrl+A), copialo y pegalo en el area de texto.','info',7000);if(dz)dz.innerHTML='<span class="dz-icon">doc</span><strong>Arrasta o hace clic para seleccionar</strong> PDF - Word - Texto';return;}else{try{text=await file.text();}catch{y('Formato no reconocido. Pega el contenido manualmente.','err');if(dz)dz.innerHTML='<span class="dz-icon">doc</span><strong>Arrasta o hace clic</strong>';return;}}if(!text.trim()){y('No se pudo extraer texto del archivo','err');if(dz)dz.innerHTML='<span class="dz-icon">doc</span><strong>Arrasta o hace clic</strong>';return;}if(ta)ta.value=text.substring(0,10000);if(dz)dz.innerHTML='<span class="dz-icon">OK</span><strong>'+C(file.name)+' - '+text.length.toLocaleString()+' caracteres cargados</strong>';y('Archivo cargado - revisa el contenido y guarda','ok',4000);}catch(err){y('Error leyendo archivo: '+(err.message||err),'err');if(dz)dz.innerHTML='<span class="dz-icon">doc</span><strong>Arrasta o hace clic</strong>';}}
window.handleDropDoc=async function(t){t.preventDefault();var dz=document.getElementById('drop-zone');if(dz)dz.classList.remove('drag');var f=t.dataTransfer&&t.dataTransfer.files&&t.dataTransfer.files[0];if(f)await _processDocFile(f);};window.handleDocFile=async function(e){var f=e&&e.target&&e.target.files&&e.target.files[0];if(f)await _processDocFile(f);if(e&&e.target)e.target.value='';};

// ===== SEKUNET PREMIUM PATCH =====
(function () {
  'use strict';

  // ── 1. CSS: animaciones suaves + estilos de timestamps ──────────────────
  const _s = document.createElement('style');
  _s.textContent = [
    '#msgs-cliente,#msgs-tecnico{transition:opacity .18s ease}',
    '.msg-group{animation:_mi .2s cubic-bezier(.2,0,0,1) both}',
    '@keyframes _mi{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}',
    '.date-separator{text-align:center;font-size:12px;margin:16px 0 8px;padding:5px 0;',
    'background:rgba(0,0,0,.03);border-radius:4px;font-weight:600;letter-spacing:.3px}',
    '.msg-time{font-size:11px;text-align:right;margin-top:5px;font-weight:500;',
    'letter-spacing:.2px;opacity:.65}',
  ].join('');
  document.head.appendChild(_s);

  // ── 2. Notificaciones de escritorio ─────────────────────────────────────
  if (Notification.permission === 'default') Notification.requestPermission();

  function _notify(body) {
    if (Notification.permission !== 'granted') return;
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

  // ── 3. Contador de no leídos en pestaña ─────────────────────────────────
  let _unread = 0;
  const _baseTitle = document.title || 'SEKUNET';
  function _incUnread() { document.title = '(' + (++_unread) + ') ' + _baseTitle; }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { _unread = 0; document.title = _baseTitle; }
  });

  // ── 4. Timestamps estilo WhatsApp ────────────────────────────────────────
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

  // ── 5. Suscripción Supabase al caso abierto (notificaciones) ────────────
  let _ch = null, _subId = null, _curCaseId = null;

  function _subscribeCase(caseId) {
    const sb = window.k || window.supabase;
    if (!sb || _subId === caseId) return;
    if (_ch) { try { sb.removeChannel(_ch); } catch (e) {} _ch = null; }
    _subId = caseId;
    if (!caseId) return;

    _ch = sb.channel('_sek_patch_' + caseId)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'sek_cases',
        filter: 'id=eq.' + caseId,
      }, payload => {
        const hist = (payload.new || {}).histcliente || [];
        const container = document.getElementById('msgs-cliente');
        const rendered = new Set(
          [...(container ? container.querySelectorAll('[data-msgtime]') : [])].map(el => el.dataset.msgtime)
        );
        const newMsgs = hist.filter(m => m.time && !rendered.has(m.time));
        const incoming = newMsgs.filter(m => m.role === 'user');
        if (incoming.length && document.hidden) {
          _notify(incoming[incoming.length - 1].content);
          _incUnread();
        }
      })
      .subscribe();
  }

  // ── 6. Wrapper de loadCase: fade suave + timestamps + suscripción ────────
  function _patchLoadCase() {
    const orig = window.loadCase;
    if (!orig) return false;

    window.loadCase = async function (caseId) {
      const isSame = caseId === _curCaseId;

      // Fade out antes del re-render (elimina el parpadeo vulgar)
      const contCBefore = document.getElementById('msgs-cliente');
      if (isSame && contCBefore) {
        contCBefore.style.transition = 'none';
        contCBefore.style.opacity = '0.15';
      }

      await orig(caseId);
      _curCaseId = caseId;

      // Obtener referencias frescas post re-render
      const contC = document.getElementById('msgs-cliente');
      const contT = document.getElementById('msgs-tecnico');

      const state = window.getState && window.getState();
      if (state) {
        _applyTimestamps(contC, state.chatHistoryCliente);
        _applyTimestamps(contT, state.chatHistoryTecnico);
      }

      // Fade in suave
      if (contC) {
        requestAnimationFrame(() => {
          contC.style.transition = 'opacity .18s ease';
          contC.style.opacity = '1';
        });
      }

      _subscribeCase(caseId);
    };

    return true;
  }

  // ── 7. Auto-close por inactividad — SIN window.location.reload() ─────────
  const _ISMS = 5 * 60 * 1000;
  const _ICMSG = '⏱️ Por inactividad, su conversación fue cerrada automáticamente. Con gusto le seguimos atendiendo.';

  function _checkInactive() {
    const sb = window.k || window.supabase;
    if (!sb) return;

    sb.from('sek_cases')
      .select('id,canal,cliente,histcliente,histtecnico,tags')
      .not('estado', 'in', '("cerrado","resuelto")')
      .limit(50)
      .then(({ data, error }) => {
        if (error || !data || !data.length) return;
        const now = Date.now();

        data.forEach(c => {
          const all = [...(c.histcliente || []), ...(c.histtecnico || [])];
          const last = all.at(-1);
          if (!last || !last.time) return;
          if (now - new Date(last.time).getTime() <= _ISMS) return;

          const newHist = [
            ...(c.histcliente || []),
            { role: 'assistant', content: _ICMSG, time: new Date().toISOString() },
          ];

          sb.from('sek_cases').update({
            estado: 'cerrado',
            cat: 'cierre',
            histcliente: newHist,
            tags: [...new Set([...(c.tags || []), 'auto_cierre_inactividad'])],
          }).eq('id', c.id)
            .then(() => {
              console.log('[Inactivity] Closed:', c.id);
              // El canal 'cases-live' de Supabase actualiza la barra lateral automáticamente.
              // Si el caso cerrado es el que está abierto, deshabilitar input sin recargar.
              if (c.id !== _curCaseId) return;
              const ta = document.querySelector('textarea, .textarea');
              if (ta) { ta.disabled = true; ta.placeholder = 'Este caso fue cerrado por inactividad.'; }
              const btn = document.querySelector('[data-action="send"], .send-btn, .btn-send');
              if (btn) btn.disabled = true;
              if (window.y) window.y('Este caso fue cerrado por inactividad', 'info', 6000);
            })
            .catch(err => console.error('[Inactivity] Update error:', err));
        });
      })
      .catch(err => console.error('[Inactivity] Fetch error:', err));
  }

  // ── 8. Arranque ──────────────────────────────────────────────────────────
  function _boot() {
    if (!_patchLoadCase()) {
      setTimeout(_boot, 400);
      return;
    }
    console.log('[Premium] loadCase patched OK');

    // Suscribir al caso ya abierto (si hay uno)
    setTimeout(() => {
      const state = window.getState && window.getState();
      if (state && state.curCaseId) {
        _curCaseId = state.curCaseId;
        _subscribeCase(state.curCaseId);
        console.log('[Premium] Subscribed to open case:', state.curCaseId);
      }
    }, 1500);

    // Checker de inactividad
    setTimeout(() => {
      _checkInactive();
      setInterval(_checkInactive, 30000);
      console.log('[Premium] Inactivity checker started');
    }, 3000);
  }

  _boot();
})();
