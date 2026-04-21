// ─── API GEMINI (via Edge Function) ──────────────────────────────────────────
// Las llamadas a Gemini pasan por la Edge Function gemini-proxy en Supabase.
// La API Key de Gemini NUNCA llega al browser.

import { sb } from '../db/supabase.js';
import { GEMINI_MODELS, GEMINI_EDGE_URL } from '../config.js';
import { state } from '../state.js';
import { showToast } from '../ui/toast.js';

// ─── LLAMADA PRINCIPAL A GEMINI ───────────────────────────────────────────────
export async function callGemini(modelId, payload) {
  // Intentar obtener sesión activa; si no hay, refrescarla
  let { data: { session } } = await sb.auth.getSession();
  if (!session) {
    const { data: refreshed } = await sb.auth.refreshSession();
    session = refreshed.session;
  }
  if (!session?.access_token) {
    showToast('Sesión expirada. Volvé a ingresar.', 'err', 4000);
    throw new Error('Sin sesión activa');
  }

  const res = await fetch(GEMINI_EDGE_URL, {
    method : 'POST',
    headers: {
      'Content-Type' : 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey'       : import.meta.env.VITE_SB_ANON_KEY,
    },
    body: JSON.stringify({ modelId, payload }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (res.status === 401) showToast('Sesión expirada. Volvé a ingresar.', 'err', 4000);
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// ─── FALLBACK ENTRE MODELOS ───────────────────────────────────────────────────
// Si el modelo preferido falla, prueba el siguiente automáticamente.
export async function callGeminiWithFallback(payload) {
  let lastError = null;

  for (let i = state.currentModelIdx; i < GEMINI_MODELS.length; i++) {
    try {
      const data = await callGemini(GEMINI_MODELS[i].id, payload);

      if (data.error) {
        const msg = data.error.message || '';
        // Si el modelo está deprecado, pasar al siguiente
        if ((msg.includes('not found') || msg.includes('deprecated')) && i < GEMINI_MODELS.length - 1) {
          showToast('Modelo no disponible, cambiando…', 'info', 2000);
          continue;
        }
        throw new Error(msg);
      }

      // Si cambió el modelo, actualizar el índice en estado
      if (i !== state.currentModelIdx) {
        state.currentModelIdx = i;
        showToast('Usando: ' + GEMINI_MODELS[i].label, 'info', 3000);
      }

      return data;
    } catch (err) {
      lastError = err;
      if (i === GEMINI_MODELS.length - 1) break;
    }
  }

  throw lastError ?? new Error('No se pudo conectar a Gemini');
}

// ─── EMBEDDING PARA RAG ───────────────────────────────────────────────────────
// También pasa por Edge Function para no exponer la API key.
export async function getEmbedding(text) {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;

    const res = await fetch(GEMINI_EDGE_URL, {
      method : 'POST',
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        modelId: 'embedding-001',
        payload: {
          model  : 'models/embedding-001',
          content: { parts: [{ text: text.substring(0, 2000) }] },
        },
        mode: 'embed',  // le dice a la Edge Function que use embedContent
      }),
    });

    const data = await res.json();
    if (data.error) return null;
    return data.embedding?.values ?? null;
  } catch {
    return null;
  }
}

// ─── BÚSQUEDA RAG ─────────────────────────────────────────────────────────────
export async function searchRAG(query, topK = 4) {
  try {
    const emb = await getEmbedding(query);
    if (!emb) return [];

    const { data, error } = await sb.rpc('search_chunks', {
      query_embedding: emb,
      match_count    : topK,
    });

    if (error) return [];
    return (data ?? []).filter(r => r.similarity > 0.45);
  } catch {
    return [];
  }
}
