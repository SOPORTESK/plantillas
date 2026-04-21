// ─── CONOCIMIENTO (train, docs, plantillas, RAG) ──────────────────────────────

import { sb }        from '../db/supabase.js';
import { state }     from '../state.js';
import { genId, formatDate } from '../utils.js';
import { showToast } from '../ui/toast.js';
import { getEmbedding } from '../api/gemini.js';

// ─── AGREGAR CONOCIMIENTO ─────────────────────────────────────────────────────
export async function addKnowledge(q, a, cat, source = 'manual', silent = false) {
  if (!q || !a) return null;
  const id = genId();
  const tr = {
    id, q: q.substring(0, 400), a: a.substring(0, 1200),
    cat: cat ?? 'procedimiento', source, date: formatDate(),
  };
  const { error } = await sb.from('sek_train').insert(tr);
  if (error) {
    console.warn('addKnowledge:', error.message);
    state.trainData.unshift(tr);
    localStorage.setItem('sek_train', JSON.stringify(state.trainData.slice(0, 200)));
    if (!silent) showToast('Guardado localmente (BD: ' + error.code + ')', 'info', 4000);
  } else {
    state.trainData.unshift(tr);
    if (!silent) showToast('Conocimiento guardado ✓', 'ok', 2000);
  }
  return tr;
}

// ─── ACTUALIZAR CONOCIMIENTO ──────────────────────────────────────────────────
export async function updateKnowledge(id, q, a, cat) {
  const idx = state.trainData.findIndex(t => t.id === id);
  if (idx === -1) return;
  const updated = { ...state.trainData[idx], q, a, cat, date: formatDate() };
  const { error } = await sb.from('sek_train').update({ q, a, cat, date: updated.date }).eq('id', id);
  if (error) { showToast('Error actualizando: ' + error.message, 'err', 4000); return; }
  state.trainData[idx] = updated;
  showToast('Conocimiento actualizado ✓', 'ok', 2000);
}

// ─── ELIMINAR CONOCIMIENTO ────────────────────────────────────────────────────
export async function deleteTrain(id) {
  if (!confirm('¿Eliminar este conocimiento?')) return;
  state.trainData = state.trainData.filter(t => t.id !== id);
  await sb.from('sek_train').delete().eq('id', id);
  showToast('Eliminado', 'ok');
}

// ─── GUARDAR RESPUESTA IA EN KB ───────────────────────────────────────────────
export async function saveRespToKB(btn, chat) {
  const bubble = btn.closest('.bubble-ia');
  let txt = '';
  const raw  = bubble.querySelector('div[style*="pre-wrap"]');
  const sugs = bubble.querySelectorAll('.sug-text');
  if (raw)        txt = raw.textContent.substring(0, 800);
  else if (sugs.length) txt = Array.from(sugs).map(s => s.textContent).join(' | ').substring(0, 800);
  if (!txt) { showToast('No hay texto para guardar', 'err'); return; }

  const hist     = chat === 'cliente' ? state.chatHistoryCliente : state.chatHistoryTecnico;
  const lastUser = hist.filter(m => m.role === 'user').at(-1);
  const q        = (lastUser?.content ?? 'Consulta desde chat').substring(0, 300);
  btn.textContent = '⏳ Guardando…'; btn.disabled = true;
  await addKnowledge(q, txt, 'procedimiento', 'chat', false);
  btn.textContent = '✓ Guardado en conocimiento';
}

// ─── INDEXAR DOCUMENTO EN RAG ─────────────────────────────────────────────────
export async function indexDocumentChunks(docId, docName, content) {
  try {
    await sb.from('sek_doc_chunks').delete().eq('doc_id', docId);
    const sz = 500, ov = 50;
    const chunks = [];
    for (let i = 0; i < content.length; i += sz - ov) {
      const c = content.substring(i, i + sz);
      if (c.trim().length > 50) chunks.push(c);
      if (i + sz >= content.length) break;
    }
    showToast(`Indexando ${chunks.length} fragmentos…`, 'info', 8000);
    for (let i = 0; i < chunks.length; i++) {
      const emb = await getEmbedding(chunks[i]);
      if (emb) {
        const { error } = await sb.from('sek_doc_chunks').insert({
          doc_id: docId, doc_name: docName, chunk_index: i, content: chunks[i], embedding: emb,
        });
        if (error) console.warn('chunk:', error);
      }
      if (i % 3 === 0 && i > 0) await new Promise(r => setTimeout(r, 500));
    }
    const { count } = await sb.from('sek_doc_chunks').select('*', { count: 'exact', head: true });
    const el = document.getElementById('rag-status');
    if (el) el.textContent = `● RAG: ${count ?? 0} fragmentos`;
    showToast(`Indexado — ${chunks.length} fragmentos listos`, 'ok', 3000);
  } catch (e) {
    console.error('indexDoc:', e);
    showToast('Error indexando: ' + e.message, 'err', 4000);
  }
}

// ─── GUARDAR DOCUMENTO ────────────────────────────────────────────────────────
export async function saveDoc(name, content, tips) {
  if (!name || !content) { showToast('Completá nombre y contenido', 'err'); return; }
  const docId = genId();
  const doc   = { id: docId, name, content: content.substring(0, 10000), date: formatDate(), size: content.length };
  const { error } = await sb.from('sek_docs').insert(doc);
  if (error) {
    console.error('doc insert:', error);
    state.docs.unshift(doc);
    localStorage.setItem('sek_docs', JSON.stringify(state.docs));
    showToast('Guardado localmente', 'info', 4000);
  } else {
    state.docs.unshift(doc);
    showToast('Manual guardado — indexando…', 'ok', 2500);
  }
  const kbText = `MANUAL: ${name}\n\n${content.substring(0, 800)}${tips ? '\n\nTIPS: ' + tips : ''}`;
  await addKnowledge(`Consulta sobre manual: ${name}`, kbText, 'procedimiento', 'manual', true);
  if (tips) await addKnowledge(`Tips del manual ${name}`, tips, 'procedimiento', 'manual', true);
  indexDocumentChunks(docId, name, content + (tips ? '\n\nTIPS DEL TÉCNICO: ' + tips : ''));
  return doc;
}

// ─── ELIMINAR DOCUMENTO ───────────────────────────────────────────────────────
export async function deleteDoc(id) {
  if (!confirm('¿Eliminar este manual?')) return;
  state.docs = state.docs.filter(d => d.id !== id);
  await Promise.all([
    sb.from('sek_docs').delete().eq('id', id),
    sb.from('sek_doc_chunks').delete().eq('doc_id', id),
  ]);
  try {
    const { count } = await sb.from('sek_doc_chunks').select('*', { count: 'exact', head: true });
    const el = document.getElementById('rag-status');
    if (el) el.textContent = `● RAG: ${count ?? 0} fragmentos`;
  } catch (_) { /* ignorar */ }
  showToast('Manual eliminado', 'ok');
}

// ─── PLANTILLAS ───────────────────────────────────────────────────────────────
export async function savePlantilla(editId, nombre, cat, texto) {
  if (!nombre || !texto) { showToast('Completá nombre y texto', 'err'); return; }
  if (editId) {
    const { error } = await sb.from('sek_plantillas').update({ nombre, cat, texto }).eq('id', editId);
    if (!error) {
      const idx = state.plantillas.findIndex(p => p.id === editId);
      if (idx > -1) state.plantillas[idx] = { ...state.plantillas[idx], nombre, cat, texto };
    }
    showToast(error ? 'Error actualizando' : 'Plantilla actualizada ✓', error ? 'err' : 'ok', 3000);
  } else {
    const id = genId();
    const p  = { id, nombre, cat, texto, date: formatDate() };
    const { error } = await sb.from('sek_plantillas').insert(p);
    if (error) {
      console.warn('insert plantilla:', error.message);
      state.plantillas.unshift(p);
      localStorage.setItem('sek_plantillas', JSON.stringify(state.plantillas));
      showToast('Guardado localmente', 'info', 5000);
    } else {
      state.plantillas.unshift(p);
      showToast('Plantilla guardada ✓', 'ok');
    }
  }
}

export async function deletePlantilla(id) {
  if (!confirm('¿Eliminar esta plantilla?')) return;
  state.plantillas = state.plantillas.filter(p => p.id !== id);
  await sb.from('sek_plantillas').delete().eq('id', id);
  showToast('Plantilla eliminada', 'ok');
}
