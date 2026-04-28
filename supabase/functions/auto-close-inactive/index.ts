import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://kzcyxeracvfxynddyjld.supabase.co'
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''
const TWILIO_WA_FROM = Deno.env.get('TWILIO_WA_FROM') ?? 'whatsapp:+14155238886'

const db = createClient(SUPABASE_URL, SERVICE_KEY)

const INACTIVITY_CLOSE_MINUTES = 5;
const DISABLE_AUTO_CLOSE = false; // set false to re‑enable auto‑close
const INACTIVITY_CLOSE_MSG = `⏱️ Por inactividad, su conversación anterior fue cerrada automáticamente.

Con gusto le seguimos atendiendo. Por favor indíquenos nuevamente su consulta para abrir un nuevo caso.`

type Msg = { role: string; content: string; time: string }

function getCaseLastActivity(caso: {
  histcliente?: Msg[]
  histtecnico?: Msg[]
  updated_at?: string
  created_at?: string
}): Date {
  const all = [...(caso.histcliente ?? []), ...(caso.histtecnico ?? [])]
  const last = all.at(-1)?.time ?? caso.updated_at ?? caso.created_at ?? new Date(0).toISOString()
  const d = new Date(last)
  return Number.isNaN(d.getTime()) ? new Date(0) : d
}

async function sendWA(to: string, body: string) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.log('[auto-close-inactive] Twilio credentials not configured, skipping WhatsApp send')
    return
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      From: TWILIO_WA_FROM,
      To: `whatsapp:${to}`,
      Body: body,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('[auto-close-inactive] sendWA Twilio error:', res.status, err)
  }
}

Deno.serve(async () => {
  console.log('[auto-close-inactive] Starting check...')
  
  const { data: casos, error } = await db
    .from('sek_cases')
    .select('id,canal,cliente,histcliente,histtecnico,tags,updated_at,created_at')
    .not('estado', 'in', '("cerrado","resuelto")')
    .limit(100)

  if (error) {
    console.error('[auto-close-inactive] Error fetching cases:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  if (!casos || casos.length === 0) {
    console.log('[auto-close-inactive] No active cases to check')
    return new Response(JSON.stringify({ closed: 0 }), { status: 200 })
  }

  const now = Date.now()
  const inactiveThreshold = INACTIVITY_CLOSE_MINUTES * 60 * 1000
  let closedCount = 0

  for (const caso of casos) {
    const lastActivity = getCaseLastActivity(caso).getTime()
    const elapsed = now - lastActivity

    if (!DISABLE_AUTO_CLOSE && elapsed > inactiveThreshold) {
      console.log(`[auto-close-inactive] Closing case ${caso.id} (inactive for ${Math.round(elapsed / 60000)} minutes)`)

      // Add closure message to history
      const closeMsg: Msg = {
        role: 'assistant',
        content: INACTIVITY_CLOSE_MSG,
        time: new Date().toISOString(),
      }
      const newHist = [...(caso.histcliente ?? []), closeMsg]

      // Update case
      const { error: updateError } = await db
        .from('sek_cases')
        .update({
          estado: 'cerrado',
          cat: 'cierre',
          histcliente: newHist,
          tags: [...new Set([...(caso.tags ?? []), 'auto_cierre_inactividad'])],
        })
        .eq('id', caso.id)

      if (updateError) {
        console.error('[auto-close-inactive] Error updating case:', updateError)
        continue
      }

      // Send WhatsApp message if it's a WhatsApp case
      if (caso.canal === 'whatsapp' && caso.cliente?.telefono) {
        try {
          await sendWA(caso.cliente.telefono, INACTIVITY_CLOSE_MSG)
        } catch (err) {
          console.error('[auto-close-inactive] Failed to send WhatsApp to', caso.cliente.telefono, err)
        }
      }

      closedCount++
    }
  }

  console.log(`[auto-close-inactive] Completed. Closed ${closedCount} inactive cases.`)
  return new Response(JSON.stringify({ closed: closedCount }), { status: 200 })
})
