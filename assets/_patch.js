// ── Fallbacks para funciones del bundle (por si no ha cargado) ────────────
if(typeof C==='undefined')window.C=function(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;};
if(typeof y==='undefined')window.y=function(){};

async function _processDocFile(file){const ext=file.name.split('.').pop().toLowerCase();const dz=document.getElementById('drop-zone');const ta=document.getElementById('doc-content');const ni=document.getElementById('doc-name');if(ni&&!ni.value.trim())ni.value=file.name.replace(/\.[^.]+$/,'');if(dz)dz.innerHTML='<span class="dz-icon">...</span><strong>Leyendo '+C(file.name)+'...</strong>';try{let text='';if(ext==='txt'||ext==='md'||ext==='csv'){text=await file.text();}else if(ext==='docx'||ext==='doc'){if(typeof mammoth==='undefined'){y('Error: mammoth no disponible','err');if(dz)dz.innerHTML='<span class="dz-icon">doc</span><strong>Arrasta o hace clic para seleccionar</strong>';return;}const ab=await file.arrayBuffer();const res=await mammoth.extractRawText({arrayBuffer:ab});text=res.value||'';}else if(ext==='pdf'){y('Para PDF: abri el PDF, selecciona todo (Ctrl+A), copialo y pegalo en el area de texto.','info',7000);if(dz)dz.innerHTML='<span class="dz-icon">doc</span><strong>Arrasta o hace clic para seleccionar</strong> PDF - Word - Texto';return;}else{try{text=await file.text();}catch{y('Formato no reconocido. Pega el contenido manualmente.','err');if(dz)dz.innerHTML='<span class="dz-icon">doc</span><strong>Arrasta o hace clic</strong>';return;}}if(!text.trim()){y('No se pudo extraer texto del archivo','err');if(dz)dz.innerHTML='<span class="dz-icon">doc</span><strong>Arrasta o hace clic</strong>';return;}if(ta)ta.value=text.substring(0,10000);if(dz)dz.innerHTML='<span class="dz-icon">OK</span><strong>'+C(file.name)+' - '+text.length.toLocaleString()+' caracteres cargados</strong>';y('Archivo cargado - revisa el contenido y guarda','ok',4000);}catch(err){y('Error leyendo archivo: '+(err.message||err),'err');if(dz)dz.innerHTML='<span class="dz-icon">doc</span><strong>Arrasta o hace clic</strong>';}}
window.handleDropDoc=async function(t){t.preventDefault();var dz=document.getElementById('drop-zone');if(dz)dz.classList.remove('drag');var f=t.dataTransfer&&t.dataTransfer.files&&t.dataTransfer.files[0];if(f)await _processDocFile(f);};window.handleDocFile=async function(e){var f=e&&e.target&&e.target.files&&e.target.files[0];if(f)await _processDocFile(f);if(e&&e.target)e.target.value='';};

// Upload de manuales robusto (PDF/Word/TXT) + guardado sin cerrar modal por error
async function _ocrCanvas(canvas){
  if(typeof Tesseract==='undefined' || !canvas) return '';
  try{
    const out=await Tesseract.recognize(canvas,'spa+eng',{
      logger:()=>{}
    });
    return (out&&out.data&&out.data.text?out.data.text:'').trim();
  }catch{
    return '';
  }
}

async function _extractPdfText(file){
  if(typeof pdfjsLib==='undefined') return '';
  const ab=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:ab}).promise;
  const parts=[];
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const tc=await page.getTextContent();
    const plain=tc.items.map(i=>i.str||'').join(' ').trim();
    if(plain.length>20){
      parts.push(plain);
      continue;
    }
    const viewport=page.getViewport({scale:1.8});
    const canvas=document.createElement('canvas');
    const ctx=canvas.getContext('2d');
    canvas.width=Math.ceil(viewport.width);
    canvas.height=Math.ceil(viewport.height);
    if(ctx){
      await page.render({canvasContext:ctx,viewport}).promise;
      const ocr=await _ocrCanvas(canvas);
      if(ocr) parts.push(ocr);
    }
  }
  return parts.join('\n\n').trim();
}

async function _processDocFileSafe(file){
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  const dz=document.getElementById('drop-zone');
  const ta=document.getElementById('doc-content');
  const ni=document.getElementById('doc-name');
  if(ni&&!ni.value.trim())ni.value=file.name.replace(/\.[^.]+$/,'');
  if(dz)dz.innerHTML='<span class="dz-icon">...</span><strong>Leyendo '+C(file.name)+'...</strong>';
  try{
    let text='';
    if(ext==='txt'||ext==='md'||ext==='csv'){
      text=await file.text();
    }else if(ext==='docx'||ext==='doc'){
      if(typeof mammoth==='undefined'){
        y('Error: mammoth no disponible','err');
        if(dz)dz.innerHTML='<span class="dz-icon">doc</span><strong>Arrastrá o hacé clic para seleccionar</strong>';
        return;
      }
      const ab=await file.arrayBuffer();
      const res=await mammoth.extractRawText({arrayBuffer:ab});
      text=res.value||'';
    }else if(ext==='pdf'){
      text=await _extractPdfText(file);
      if(!text.trim()){
        const fallback='[PDF sin texto extraible] '+file.name+'\n\nPegue aqui el contenido manual del PDF para indexarlo con mejor calidad.';
        if(ta&&!ta.value.trim())ta.value=fallback;
        y('PDF detectado sin texto extraíble. Se cargó contenido base para permitir guardado.','warn',7000);
        if(dz)dz.innerHTML='<span class="dz-icon">pdf</span><strong>PDF sin texto extraíble — podés guardar o pegar texto manual</strong>';
        return;
      }
    }else{
      try{text=await file.text();}catch{}
    }

    if(!text.trim()){
      y('No se pudo extraer texto del archivo','err');
      if(dz)dz.innerHTML='<span class="dz-icon">doc</span><strong>Arrastrá o hacé clic</strong>';
      return;
    }

    if(ta)ta.value=text.substring(0,10000);
    if(dz)dz.innerHTML='<span class="dz-icon">OK</span><strong>'+C(file.name)+' - '+text.length.toLocaleString()+' caracteres cargados</strong>';
    y('Archivo cargado - revisa el contenido y guarda','ok',4000);
  }catch(err){
    y('Error leyendo archivo: '+(err&&err.message?err.message:err),'err');
    if(dz)dz.innerHTML='<span class="dz-icon">doc</span><strong>Arrastrá o hacé clic</strong>';
  }
}

window.handleDropDoc=async function(t){
  t.preventDefault();
  var dz=document.getElementById('drop-zone');
  if(dz)dz.classList.remove('drag');
  var f=t.dataTransfer&&t.dataTransfer.files&&t.dataTransfer.files[0];
  if(f)await _processDocFileSafe(f);
};

window.handleDocFile=async function(e){
  var f=e&&e.target&&e.target.files&&e.target.files[0];
  if(f)await _processDocFileSafe(f);
  if(e&&e.target)e.target.value='';
};

// Guardado seguro: evita doble clic / duplicados masivos, sin alterar indexación nativa
(function(){
  const WRAPPED_FLAG='__sekWrappedDocSaveMinimal';
  const SUPABASE_URL='https://kzcyxeracvfxynddyjld.supabase.co';
  const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Y3l4ZXJhY3ZmeHluZGR5amxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTE5NTQsImV4cCI6MjA5MTA4Nzk1NH0.DvEnK-g5rMxzFec4Fl3rJ5VVDYVJ7-ua9ssqf3s-QKtU';
  let inFlight=false;
  let deleteInFlight=false;
  let refreshQueued=false;
  const _chunkCountCache=new Map();

  async function _fetchChunkCount(docId){
    if(!docId) return 0;
    const cacheHit=_chunkCountCache.get(docId);
    if(typeof cacheHit==='number') return cacheHit;
    try{
      const url=`${SUPABASE_URL}/rest/v1/sek_doc_chunks?doc_id=eq.${encodeURIComponent(docId)}&select=id`;
      const res=await fetch(url,{method:'HEAD',headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${SUPABASE_ANON_KEY}`,Prefer:'count=exact'}});
      if(!res.ok) return 0;
      const cr=res.headers.get('content-range')||'';
      const m=cr.match(/\/(\d+)$/);
      const count=m?Number(m[1]):0;
      _chunkCountCache.set(docId,count);
      return count;
    }catch{
      return 0;
    }
  }

  function _extractDocIdFromDeleteButton(btn){
    const m=(btn&&btn.getAttribute&&btn.getAttribute('onclick')||'').match(/deleteDoc\('([^']+)'\)/);
    return m?m[1]:null;
  }

  async function _refreshDocChunkBadges(){
    const adminRoot=document.getElementById('admin-docs-list');
    if(adminRoot){
      const rows=[...adminRoot.querySelectorAll('.admin-item')];
      for(const row of rows){
        const del=row.querySelector('button[onclick*="deleteDoc("]');
        const meta=row.querySelector('.admin-item-meta');
        const docId=_extractDocIdFromDeleteButton(del);
        if(!docId||!meta) continue;
        const count=await _fetchChunkCount(docId);
        const current=meta.textContent||'';
        if(/fragmentos\s+RAG/i.test(current)){
          meta.textContent=current.replace(/\d+\s+fragmentos\s+RAG/i,`${count} fragmentos RAG`);
        }
      }
    }
    const sideRoot=document.getElementById('docs-list');
    if(sideRoot){
      const cards=[...sideRoot.children];
      for(const card of cards){
        const del=card.querySelector&&card.querySelector('button[onclick*="deleteDoc("]');
        const size=card.querySelector&&card.querySelector('.doc-size');
        const docId=_extractDocIdFromDeleteButton(del);
        if(!docId||!size) continue;
        const count=await _fetchChunkCount(docId);
        size.textContent=`${count} fragmentos RAG`;
      }
    }
  }

  function _queueUiRefresh(){
    if(refreshQueued) return;
    refreshQueued=true;
    requestAnimationFrame(()=>{
      refreshQueued=false;
      try{typeof renderAdminTools==='function'&&renderAdminTools()}catch{}
      try{
        const admin=document.getElementById('admin-overlay');
        if(admin&&admin.classList.contains('open')&&typeof openAdminTools==='function') openAdminTools();
      }catch{}
      try{typeof renderChatsRecientes==='function'&&renderChatsRecientes()}catch{}
      try{typeof renderConversacionesList==='function'&&renderConversacionesList()}catch{}
      try{typeof renderNotasInternas==='function'&&renderNotasInternas()}catch{}
      _chunkCountCache.clear();
      _refreshDocChunkBadges();
    });
  }

  function _setSavingUi(on){
    const p=document.getElementById('doc-processing');
    const b=document.getElementById('doc-save-btn');
    if(p)p.style.display=on?'block':'none';
    if(b){
      b.disabled=!!on;
      b.style.opacity=on?'.75':'1';
      b.style.pointerEvents=on?'none':'auto';
    }
  }

  function _install(){
    const orig=window.saveDocHandler;
    if(typeof orig!=='function' || orig[WRAPPED_FLAG]) return false;
    const wrapped=async function(...args){
      const name=(document.getElementById('doc-name')?.value||'').trim();
      const content=(document.getElementById('doc-content')?.value||'').trim();
      if(!name||!content){
        y('Nombre y contenido requeridos','err',3000);
        return;
      }
      if(inFlight){
        y('Ya se está guardando este manual…','info',2200);
        return;
      }
      const sig=name+'|'+content.substring(0,180);
      const now=Date.now();
      if(window.__sekLastDocSig===sig && now-(window.__sekLastDocTs||0)<15000){
        y('Ese manual ya se envió hace unos segundos','warn',3000);
        return;
      }
      inFlight=true;
      _setSavingUi(true);
      try{
        await orig.apply(this,args);
        window.__sekLastDocSig=sig;
        window.__sekLastDocTs=Date.now();
        _queueUiRefresh();
      }catch(err){
        console.error('[docs] saveDocHandler error:',err);
        y('Error guardando manual','err',4000);
      }finally{
        inFlight=false;
        _setSavingUi(false);
      }
    };
    wrapped[WRAPPED_FLAG]=true;
    window.saveDocHandler=wrapped;
    return true;
  }

  const iv=setInterval(()=>{if(_install())clearInterval(iv)},200);
  setTimeout(()=>clearInterval(iv),60000);

  function _wrapDeleteDoc(){
    const orig=window.deleteDoc;
    if(typeof orig!=='function' || orig.__sekWrappedDeleteMinimal) return false;
    const wrapped=async function(id,...rest){
      if(deleteInFlight){
        y('Ya se está eliminando…','info',1800);
        return;
      }
      deleteInFlight=true;
      try{
        await orig.call(this,id,...rest);
        _queueUiRefresh();
      }finally{
        deleteInFlight=false;
      }
    };
    wrapped.__sekWrappedDeleteMinimal=true;
    window.deleteDoc=wrapped;
    return true;
  }

  function _wrapPostActionRefresh(fnName){
    const orig=window[fnName];
    if(typeof orig!=='function' || orig.__sekWrappedRefresh) return false;
    const wrapped=async function(...args){
      const out=await orig.apply(this,args);
      _queueUiRefresh();
      return out;
    };
    wrapped.__sekWrappedRefresh=true;
    window[fnName]=wrapped;
    return true;
  }

  const iv2=setInterval(()=>{
    _wrapDeleteDoc();
    _wrapPostActionRefresh('saveTrainHandler');
    _wrapPostActionRefresh('deleteTrain');
    _wrapPostActionRefresh('savePlantillaHandler');
    _wrapPostActionRefresh('deletePlantillaHandler');
  },300);
  setTimeout(()=>clearInterval(iv2),60000);

})();

// ===== SEKUNET PREMIUM RT v7 — solo msgs-cliente, técnico sin tocar =====
(function () {
  'use strict';

  // Desactivado temporalmente para eliminar parpadeo/pegado del chat técnico.
  // Se reemplazará por una separación real de módulos cliente/técnico.
  return;

  // ── 1. CSS — solo #msgs-cliente ──────────────────────────────────────────
  const _s = document.createElement('style');
  _s.textContent = [
    '#msgs-cliente .msg-group:not(._seen){animation:_mi .22s cubic-bezier(.2,0,0,1) both}',
    '@keyframes _mi{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
    '#msgs-cliente .msg-group._seen{animation:none!important;opacity:1!important;transform:none!important}',
    '#msgs-cliente .date-separator{text-align:center;font-size:12px;margin:14px 0 6px;padding:4px 0;',
    'background:rgba(0,0,0,.03);border-radius:4px;font-weight:600;letter-spacing:.3px}',
    '#msgs-cliente .msg-time{font-size:11px;text-align:right;margin-top:4px;font-weight:500;opacity:.62}',
  ].join('');
  document.head.appendChild(_s);

  // ── 2. Notificaciones de escritorio ──────────────────────────────────────
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

  // ── 5. MutationObserver — solo msgs-cliente ──────────────────────────────
  // msgs-tecnico NO se toca: la app ya renderiza correctamente histtecnico
  // en msgs-tecnico e histcliente en msgs-cliente. Intervenir con snapshot/restore
  // sobreescribía el render correcto con contenido potencialmente desactualizado.

  const _seenKeys = new Set(); // "caseId:msgTime"
  let _curCaseId  = null;
  let _busy       = false;
  let _lastClienteStamp = '';

  function _histStamp(hist) {
    if (!hist || !hist.length) return '';
    return hist.map(m => `${m.time || ''}:${m.role || ''}`).join('|');
  }

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
        _seenKeys.add(key);
      }
    });
  }

  function _onMutation(mutations) {
    if (_busy) return;
    const relevant = mutations.some(m =>
      Array.from(m.addedNodes).some(n =>
        n.nodeType === 1 &&
        (n.classList.contains('msg-group') || n.classList.contains('empty-wrap') || (n.id && n.id.startsWith('empty-')))
      )
    );
    if (!relevant) return;

    const state = window.getState && window.getState();
    if (!state || !state.curCaseId) return;
    if (state.curChat !== 'cliente') return;

    const caseId     = state.curCaseId;
    const isSameCase = caseId === _curCaseId;
    if (!isSameCase) {
      _curCaseId = caseId;
      _subscribeCase(caseId);
    }

    _busy = true;
    try {
      const cC = document.getElementById('msgs-cliente');
      _markMessages(cC, state.chatHistoryCliente, caseId, !isSameCase);
      const stamp = _histStamp(state.chatHistoryCliente);
      if (stamp !== _lastClienteStamp && state.chatHistoryCliente) {
        _applyTimestamps(cC, state.chatHistoryCliente);
        _lastClienteStamp = stamp;
      }
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
    if (!cC) { setTimeout(_startObserver, 400); return; }

    const state = window.getState && window.getState();
    if (state && state.curCaseId) {
      _curCaseId = state.curCaseId;
      (state.chatHistoryCliente || []).forEach(m => {
        if (m.time) _seenKeys.add(state.curCaseId + ':' + m.time);
      });
      _subscribeCase(state.curCaseId);
    }

    const obs = new MutationObserver(_onMutation);
    obs.observe(cC, { childList: true });

    console.log('[Premium v7] Observer activo — msgs-cliente antiflicker, msgs-tecnico libre');
  }

  setTimeout(_startObserver, 1500);
})();

(function(){
  const MAX_VIDEO_MB=80;
  const VIDEO_NOTE_TAG='[VIDEO_ADJUNTO]';

  function _toast(msg,type,ms){
    try{typeof y==='function'&&y(msg,type||'info',ms||3000);}catch{}
  }

  function _fmtBytes(bytes){
    const mb=(Number(bytes||0)/1048576);
    return `${mb.toFixed(1)}MB`;
  }

  function _fmtSec(sec){
    const s=Math.max(0,Math.round(Number(sec)||0));
    const m=Math.floor(s/60);
    const r=String(s%60).padStart(2,'0');
    return `${m}:${r}`;
  }

  function _chatInputId(shortChat){
    return shortChat==='tec'?'input-tecnico':'input-cliente';
  }

  function _compact(s){
    return String(s||'').replace(/[\r\n]+/g,' ').replace(/\s{2,}/g,' ').trim();
  }

  async function _buildFrameSummary(frameBlob,useOcr){
    try{
      const img=new Image();
      const url=URL.createObjectURL(frameBlob);
      await new Promise((resolve,reject)=>{
        img.onload=()=>resolve();
        img.onerror=()=>reject(new Error('No se pudo cargar fotograma'));
        img.src=url;
      });
      const w=img.naturalWidth||0;
      const h=img.naturalHeight||0;
      const c=document.createElement('canvas');
      c.width=w||640;
      c.height=h||360;
      const ctx=c.getContext('2d');
      if(!ctx){
        URL.revokeObjectURL(url);
        return 'fotograma disponible, sin metrica visual';
      }
      ctx.drawImage(img,0,0,c.width,c.height);
      const data=ctx.getImageData(0,0,c.width,c.height).data;
      let lumSum=0;
      let lumMin=255;
      let lumMax=0;
      const step=16;
      let count=0;
      for(let i=0;i<data.length;i+=4*step){
        const r=data[i],g=data[i+1],b=data[i+2];
        const lum=0.2126*r+0.7152*g+0.0722*b;
        lumSum+=lum;
        if(lum<lumMin) lumMin=lum;
        if(lum>lumMax) lumMax=lum;
        count++;
      }
      const avg=count?lumSum/count:0;
      const dyn=Math.max(0,lumMax-lumMin);
      let scene='iluminacion media';
      if(avg<55) scene='escena oscura';
      else if(avg>190) scene='escena muy iluminada';
      else if(dyn<35) scene='bajo contraste';

      let ocr='';
      if(useOcr&&typeof Tesseract!=='undefined'){
        try{
          const ocrPromise=Tesseract.recognize(c,'spa+eng',{logger:()=>{}})
            .then(out=>_compact(out&&out.data&&out.data.text?out.data.text:''));
          const timeoutPromise=new Promise(resolve=>setTimeout(()=>resolve(''),4500));
          ocr=await Promise.race([ocrPromise,timeoutPromise]);
        }catch{}
      }

      URL.revokeObjectURL(url);
      const ocrPart=ocr?` texto_en_pantalla="${_compact(ocr).slice(0,500)}".`:'';
      return `fotograma=${w}x${h}, brillo_promedio=${Math.round(avg)}/255, contraste=${Math.round(dyn)}/255, condicion="${scene}".${ocrPart}`;
    }catch{
      return 'fotograma disponible, resumen visual no disponible';
    }
  }

  function _appendVideoNote(shortChat,file,duration,frameSummary){
    const ta=document.getElementById(_chatInputId(shortChat));
    if(!ta) return;
    const safeName=_compact(file&&file.name?String(file.name):'video');
    const note=`${VIDEO_NOTE_TAG} nombre="${safeName}" duracion=${_fmtSec(duration)} tamano=${_fmtBytes(file&&file.size)}. CONTEXTO_VISUAL=${_compact(frameSummary)} Primero resume lo que el cliente muestra y pide, luego da diagnostico y pasos concretos. No indiques limitaciones de vision si ya existe CONTEXTO_VISUAL.`;
    const hasText=(ta.value||'').trim().length>0;
    ta.value=(ta.value||'')+(hasText?'\n':'')+note;
  }

  function _readVideoMeta(file){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file);
      const v=document.createElement('video');
      v.preload='metadata';
      v.muted=true;
      v.playsInline=true;
      v.onloadedmetadata=()=>{
        const out={duration:Number(v.duration)||0,width:v.videoWidth||0,height:v.videoHeight||0,url};
        resolve(out);
      };
      v.onerror=()=>reject(new Error('No se pudo leer metadata del video'));
      v.src=url;
    });
  }

  function _captureFrameAt(file,meta,seekSec){
    return new Promise((resolve,reject)=>{
      const seek=Math.max(0,Number(seekSec)||0);
      const v=document.createElement('video');
      const url=(meta&&meta.url)?meta.url:URL.createObjectURL(file);
      const done=(blob)=>{
        if(!meta||!meta.url) URL.revokeObjectURL(url);
        if(blob) resolve(blob); else reject(new Error('No se pudo capturar fotograma'));
      };
      v.preload='auto';
      v.muted=true;
      v.playsInline=true;
      v.src=url;
      v.onloadeddata=()=>{
        try{v.currentTime=seek;}catch{reject(new Error('No se pudo posicionar video'));}
      };
      v.onseeked=()=>{
        try{
          const maxW=1024;
          const ratio=(v.videoWidth&&v.videoWidth>maxW)?(maxW/v.videoWidth):1;
          const w=Math.max(1,Math.round((v.videoWidth||640)*ratio));
          const h=Math.max(1,Math.round((v.videoHeight||360)*ratio));
          const c=document.createElement('canvas');
          c.width=w;
          c.height=h;
          const ctx=c.getContext('2d');
          if(!ctx){reject(new Error('Canvas no disponible'));return;}
          ctx.drawImage(v,0,0,w,h);
          c.toBlob((blob)=>done(blob),'image/jpeg',0.85);
        }catch(err){reject(err instanceof Error?err:new Error('Error capturando fotograma'));}
      };
      v.onerror=()=>reject(new Error('No se pudo decodificar video'));
    });
  }

  function _pickVideoTimes(duration){
    const d=Math.max(0.8,Number(duration)||0.8);
    const arr=[d*0.12,d*0.48,d*0.84].map(t=>Math.max(.15,Math.min(t,Math.max(.2,d-.15))));
    const out=[];
    for(const t of arr){
      if(!out.length||Math.abs(t-out[out.length-1])>.35) out.push(t);
    }
    return out.length?out:[0.2];
  }

  async function _captureFrames(file,meta){
    const times=_pickVideoTimes(meta&&meta.duration);
    const frames=[];
    for(const t of times){
      try{
        const blob=await _captureFrameAt(file,meta,t);
        if(blob) frames.push({t,blob});
      }catch{}
    }
    if(!frames.length){
      const fallback=await _captureFrameAt(file,meta,Math.max(.2,(meta&&meta.duration?meta.duration*0.25:.5)));
      frames.push({t:Math.max(.2,(meta&&meta.duration?meta.duration*0.25:.5)),blob:fallback});
    }
    return frames;
  }

  async function _buildMultiFrameSummary(frames){
    const chunks=[];
    for(let i=0;i<frames.length;i++){
      const f=frames[i];
      const sum=await _buildFrameSummary(f.blob,i<2);
      chunks.push(`escena_${i+1}@${_fmtSec(f.t)} {${sum}}`);
    }
    return chunks.join(' | ');
  }

  async function _attachFrameAsImage(shortChat,file,frameBlob){
    if(typeof window.handleImg!=='function') return false;
    const base=(file&&file.name?file.name.replace(/\.[^.]+$/,''):'video').replace(/[^a-z0-9_\-]+/gi,'_');
    const frameFile=new File([frameBlob],`${base}_frame.jpg`,{type:'image/jpeg'});
    const syntheticEvent={target:{files:[frameFile],value:''}};
    await window.handleImg(syntheticEvent,shortChat);
    return true;
  }

  window.handleVideoAttach=async function(e,shortChat){
    const input=e&&e.target;
    const file=input&&input.files&&input.files[0];
    try{
      if(!file) return;
      if(!(file.type||'').startsWith('video/')){
        _toast('Adjuntá un archivo de video válido','err',3200);
        return;
      }
      if(file.size>MAX_VIDEO_MB*1024*1024){
        _toast(`Video muy pesado (máx ${MAX_VIDEO_MB}MB)`,'err',4500);
        return;
      }

      _toast('Procesando video… extrayendo escenas','info',2600);
      const meta=await _readVideoMeta(file);
      const frames=await _captureFrames(file,meta);
      for(const f of frames){
        await _attachFrameAsImage(shortChat,file,f.blob);
      }
      const frameSummary=await _buildMultiFrameSummary(frames);
      _appendVideoNote(shortChat,file,meta.duration,frameSummary);
      _toast('Video adjuntado: se agregaron escenas para análisis IA','ok',3600);
      if(meta&&meta.url) URL.revokeObjectURL(meta.url);
    }catch(err){
      _toast('No se pudo procesar el video: '+(err&&err.message?err.message:err),'err',4200);
    }finally{
      if(input) input.value='';
    }
  };
})();

(function(){
  const FLAG='[REGLA_VIDEO_FORZADA_V3]';
  const BASE_FORCE_RULE=`${FLAG}\nSi existe [VIDEO_ADJUNTO] o CONTEXTO_VISUAL en la consulta, debes analizar ese contexto y responder con calidad operativa. Estructura obligatoria: 1) "Lo que entendí del cliente" (1-2 líneas, concreto), 2) "Diagnóstico probable", 3) "Pasos de resolución". Queda prohibido responder con frases de incapacidad como "no puedo analizar videos/adjuntos". Si falta detalle visual, primero entrega hipótesis probables y luego pide solo 1-2 aclaraciones puntuales.`;

  function _compactTxt(s){
    return String(s||'').replace(/[\r\n]+/g,' ').replace(/\s{2,}/g,' ').trim();
  }

  function _extractClientSignal(text){
    const s=_compactTxt(text);
    const idx=s.indexOf('[VIDEO_ADJUNTO]');
    if(idx>0){
      return _compactTxt(s.slice(Math.max(0,idx-260),idx)).slice(0,220);
    }
    return s.slice(-220);
  }

  function _buildRule(text){
    const sig=_extractClientSignal(text);
    return `${BASE_FORCE_RULE}\nSEÑALES_CLIENTE="${sig}"`;
  }

  function _looksLikeVideoPrompt(text){
    const s=String(text||'');
    return s.includes('[VIDEO_ADJUNTO]') || s.includes('CONTEXTO_VISUAL=');
  }

  function _injectRule(text){
    const s=String(text||'');
    if(!s || s.includes(FLAG) || !_looksLikeVideoPrompt(s)) return s;
    return `${s}\n\n${_buildRule(s)}`;
  }

  function _mutatePayload(node){
    if(node==null) return node;
    if(typeof node==='string') return _injectRule(node);
    if(Array.isArray(node)) return node.map(_mutatePayload);
    if(typeof node==='object'){
      const out=Array.isArray(node)?[]:{};
      for(const k of Object.keys(node)){
        const v=node[k];
        if(typeof v==='string' && (k==='content'||k==='prompt'||k==='input'||k==='query'||k==='text')){
          out[k]=_injectRule(v);
        }else{
          out[k]=_mutatePayload(v);
        }
      }
      return out;
    }
    return node;
  }

  const _origFetch=window.fetch&&window.fetch.bind(window);
  if(!_origFetch) return;

  window.fetch=function(input,init){
    try{
      if(init && typeof init.body==='string'){
        const raw=init.body;
        if(_looksLikeVideoPrompt(raw)){
          try{
            const parsed=JSON.parse(raw);
            const patched=_mutatePayload(parsed);
            init={...init,body:JSON.stringify(patched)};
          }catch{
            if(!raw.includes(FLAG)) init={...init,body:`${raw}\n\n${_buildRule(raw)}`};
          }
        }
      }
    }catch{}
    return _origFetch(input,init);
  };
})();

(function(){
  function _show(el, on){
    if(!el) return;
    el.style.display = on ? '' : 'none';
  }

  function _applyInfoPanelByChat(){
    try{
      const state = (typeof window.getState==='function') ? window.getState() : null;
      const chat = (state && state.curChat) || 'cliente';
      const isTec = chat === 'tecnico';

      const header   = document.getElementById('ip-header-section');
      const identity = document.getElementById('ip-identity');
      const contacto = document.getElementById('ip-contacto-section');
      const equipo   = document.getElementById('ip-equipo-section');
      const files    = document.getElementById('ip-files-section');

      _show(header,   !isTec);
      _show(identity, !isTec);
      _show(contacto, !isTec);
      _show(equipo,   !isTec);
      _show(files,    true);
    }catch{}
  }

  const _origSwitchChat = window.switchChat;
  if(typeof _origSwitchChat === 'function'){
    window.switchChat = function(chat){
      const out = _origSwitchChat.apply(this, arguments);
      setTimeout(_applyInfoPanelByChat, 0);
      return out;
    };
  }

  window.addEventListener('sekunet:login-ok', ()=>setTimeout(_applyInfoPanelByChat, 120));
  document.addEventListener('DOMContentLoaded', ()=>setTimeout(_applyInfoPanelByChat, 120));
  setTimeout(_applyInfoPanelByChat, 250);
})();
