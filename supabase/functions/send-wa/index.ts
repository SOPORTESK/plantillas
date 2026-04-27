import { createClient } from 'npm:@supabase/supabase-js@2'

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN')  ?? ''
const TWILIO_WA_FROM     = Deno.env.get('TWILIO_WA_FROM')     ?? 'whatsapp:+14155238886'
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')       ?? 'https://kzcyxeracvfxynddyjld.supabase.co'
const SERVICE_KEY        = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON_KEY           = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    // ── Fix #7: Verificar autenticación JWT ──────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace('Bearer ', '')
    const sb = createClient(SUPABASE_URL, ANON_KEY)
    const { data: { user }, error: authError } = await sb.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { to, body, caseId, agente } = await req.json()
    if (!to || !body) {
      return new Response(JSON.stringify({ error: 'to and body required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Enviar mensaje por Twilio
    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: TWILIO_WA_FROM, To: `whatsapp:${to}`, Body: body }).toString(),
      }
    )
    const twilioData = await twilioRes.json()
    if (!twilioRes.ok) {
      console.error('[send-wa] Twilio error:', JSON.stringify(twilioData))
      return new Response(JSON.stringify({ ok: false, error: twilioData }), {
        status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Actualizar histcliente en Supabase si viene caseId
    if (caseId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(caseId)) {
        console.error('[send-wa] Invalid caseId format:', caseId)
      } else {
        const authKey = SERVICE_KEY || ANON_KEY
        const getRes = await fetch(`${SUPABASE_URL}/rest/v1/sek_cases?id=eq.${encodeURIComponent(caseId)}&select=histcliente`, {
          headers: { 'Authorization': `Bearer ${authKey}`, 'apikey': ANON_KEY },
        })
        if (!getRes.ok) {
          console.error('[send-wa] Supabase GET failed:', getRes.status)
        } else {
          const rows = await getRes.json()
          if (rows?.length) {
            const hist = [...(rows[0].histcliente ?? []), {
              role: 'assistant', content: body,
              time: new Date().toISOString(),
              agente: agente ?? 'Agente',
            }]
            // Fix #3: Solo actualizar historial, NO sobrescribir el estado del caso
            const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/sek_cases?id=eq.${encodeURIComponent(caseId)}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${authKey}`,
                'apikey': ANON_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
              },
              body: JSON.stringify({ histcliente: hist }),
            })
            if (!patchRes.ok) {
              console.error('[send-wa] Supabase PATCH failed:', patchRes.status)
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, twilio: twilioData.sid }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[send-wa] error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
