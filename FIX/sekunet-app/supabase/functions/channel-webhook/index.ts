// ─── EDGE FUNCTION: channel-webhook ──────────────────────────────────────────
// Recibe mensajes de clientes reales desde cualquier canal:
//   - WhatsApp Business (via Twilio o Meta Cloud API)
//   - Webchat embebido
//   - Email (futuro)
//
// Flujo:
//   1. Llega mensaje del cliente
//   2. Se guarda en sek_messages (canal de mensajes entrantes)
//   3. Se dispara notificación en tiempo real al panel del agente (Supabase Realtime)
//   4. El agente responde → otro endpoint envía la respuesta al canal original
//
// Para deployar:
//   supabase functions deploy channel-webhook
//
// Para agregar secretos:
//   supabase secrets set TWILIO_AUTH_TOKEN=xxx
//   supabase secrets set WHATSAPP_VERIFY_TOKEN=xxx

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const WA_VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';

const sb = createClient(SB_URL, SB_SERVICE_KEY);

serve(async (req: Request) => {
  const url = new URL(req.url);

  // ── Verificación de webhook Meta/WhatsApp (GET) ───────────────────────────
  if (req.method === 'GET') {
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Verificación fallida', { status: 403 });
  }

  // ── Recepción de mensajes (POST) ──────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const channel = url.searchParams.get('channel') ?? 'whatsapp';

      // Normalizar mensaje según canal
      const message = normalizeMessage(body, channel);
      if (!message) return new Response('ok', { status: 200 }); // ignorar eventos sin texto

      // Guardar en sek_messages
      const { error } = await sb.from('sek_messages').insert({
        channel         : channel,
        external_id     : message.externalId,
        from_number     : message.from,
        from_name       : message.fromName,
        content         : message.text,
        media_url       : message.mediaUrl ?? null,
        raw_payload     : body,
        status          : 'pending',  // pending → assigned → resolved
        created_at      : new Date().toISOString(),
      });

      if (error) {
        console.error('Error guardando mensaje:', error.message);
        return new Response('Error interno', { status: 500 });
      }

      // Supabase Realtime notifica automáticamente al panel del agente
      // (el panel escucha sek_messages con sb.channel('new-messages').on(...))

      return new Response('ok', { status: 200 });
    } catch (err) {
      console.error('Webhook error:', err);
      return new Response('Error', { status: 500 });
    }
  }

  return new Response('Método no permitido', { status: 405 });
});

// ─── NORMALIZADOR DE MENSAJES POR CANAL ──────────────────────────────────────
function normalizeMessage(body: unknown, channel: string) {
  if (channel === 'whatsapp') {
    // Formato Meta Cloud API
    const entry   = (body as any)?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const msg     = changes?.messages?.[0];
    if (!msg) return null;
    return {
      externalId: msg.id,
      from      : msg.from,
      fromName  : changes?.contacts?.[0]?.profile?.name ?? '',
      text      : msg.text?.body ?? msg.caption ?? '[Media]',
      mediaUrl  : msg.image?.id ?? msg.audio?.id ?? null,
    };
  }

  if (channel === 'webchat') {
    // Formato del webchat embebido (definido por nosotros)
    return {
      externalId: (body as any).messageId,
      from      : (body as any).sessionId,
      fromName  : (body as any).visitorName ?? 'Visitante',
      text      : (body as any).text,
      mediaUrl  : null,
    };
  }

  return null;
}
