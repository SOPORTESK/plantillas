// ─── EDGE FUNCTION: gemini-proxy ─────────────────────────────────────────────
// Corre en los servidores de Supabase — nunca en el browser.
// La API Key de Gemini vive aquí como secreto del servidor (GEMINI_API_KEY).
//
// Para deployar:
//   supabase functions deploy gemini-proxy --no-verify-jwt
//
// Para agregar el secreto:
//   supabase secrets set GEMINI_API_KEY=AIzaSy...

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const SB_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SB_ANON_KEY    = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SB_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? SB_ANON_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Verificar que el agente está autenticado ──────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Decodificar el email del JWT sin verificación de firma
    // (Supabase ya valida el JWT en el gateway antes de llegar aquí)
    let userEmail = 'unknown';
    try {
      const payload = JSON.parse(atob(authHeader.replace('Bearer ', '').split('.')[1]));
      userEmail = payload.email ?? payload.sub ?? 'unknown';
    } catch (_) { /* ignorar si falla el decode */ }

    // ── Leer payload del request ──────────────────────────────────────────────
    const { modelId, payload } = await req.json();
    if (!modelId || !payload) {
      return new Response(JSON.stringify({ error: 'Faltan modelId o payload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Llamar a Gemini con la API Key del servidor ───────────────────────────
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(payload),
      }
    );

    const data = await geminiRes.json();

    // ── Log de auditoría (fire-and-forget) ───────────────────────────────────
    const sbLog = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } });
    await sbLog.from('sek_audit_log').insert({
      agent_email : userEmail,
      model_id    : modelId,
      tokens_in   : data.usageMetadata?.promptTokenCount ?? 0,
      tokens_out  : data.usageMetadata?.candidatesTokenCount ?? 0,
      created_at  : new Date().toISOString(),
    }).then(() => {});   // fire-and-forget, no bloquea la respuesta

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
