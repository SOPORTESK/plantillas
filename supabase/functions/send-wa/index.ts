const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN')  ?? ''
const TWILIO_WA_FROM     = Deno.env.get('TWILIO_WA_FROM')     ?? 'whatsapp:+14155238886'
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')       ?? 'https://kzcyxeracvfxynddyjld.supabase.co'
const SERVICE_KEY        = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON_KEY           = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Y3l4ZXJhY3ZmeHluZGR5amxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTE5NTQsImV4cCI6MjA5MTA4Nzk1NH0.DvEnK-g5rMxzFec4Fl3rJ5VDYVJ7-ua9ssqf3s-QKtU'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
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
    }

    // Actualizar histcliente en Supabase si viene caseId
    if (caseId) {
      const authKey = SERVICE_KEY || ANON_KEY
      const getRes = await fetch(`${SUPABASE_URL}/rest/v1/sek_cases?id=eq.${caseId}&select=histcliente`, {
        headers: { 'Authorization': `Bearer ${authKey}`, 'apikey': ANON_KEY },
      })
      const rows = await getRes.json()
      if (rows?.length) {
        const hist = [...(rows[0].histcliente ?? []), {
          role: 'assistant', content: body,
          time: new Date().toISOString(),
          agente: agente ?? 'Agente',
        }]
        await fetch(`${SUPABASE_URL}/rest/v1/sek_cases?id=eq.${caseId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${authKey}`,
            'apikey': ANON_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ histcliente: hist, estado: 'en_proceso' }),
        })
      }
    }

    return new Response(JSON.stringify({ ok: true, twilio: twilioData?.sid }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[send-wa] error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
