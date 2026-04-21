-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 002: TABLA DE MENSAJES DE CLIENTES REALES
-- Ejecutar en Supabase → SQL Editor DESPUÉS de la migración 001
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── TABLA sek_messages ──────────────────────────────────────────────────────
-- Recibe mensajes desde cualquier canal (WhatsApp, webchat, etc.)
-- El panel del agente escucha esta tabla con Supabase Realtime.

CREATE TABLE IF NOT EXISTS sek_messages (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  channel       text NOT NULL,           -- 'whatsapp' | 'webchat' | 'email'
  external_id   text,                    -- ID del mensaje en el canal externo
  from_number   text NOT NULL,           -- número o session ID del cliente
  from_name     text,                    -- nombre del cliente si está disponible
  content       text NOT NULL,           -- texto del mensaje
  media_url     text,                    -- URL de imagen/audio si existe
  raw_payload   jsonb,                   -- payload original del webhook (para debug)
  status        text DEFAULT 'pending',  -- 'pending' | 'assigned' | 'resolved'
  case_id       text REFERENCES sek_cases(id) ON DELETE SET NULL,
  agent_email   text,                    -- agente asignado
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_sek_messages_status     ON sek_messages(status);
CREATE INDEX IF NOT EXISTS idx_sek_messages_channel    ON sek_messages(channel);
CREATE INDEX IF NOT EXISTS idx_sek_messages_from       ON sek_messages(from_number);
CREATE INDEX IF NOT EXISTS idx_sek_messages_created_at ON sek_messages(created_at DESC);

-- RLS
ALTER TABLE sek_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agentes_ver_mensajes" ON sek_messages;
CREATE POLICY "agentes_ver_mensajes" ON sek_messages
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "agentes_actualizar_mensajes" ON sek_messages;
CREATE POLICY "agentes_actualizar_mensajes" ON sek_messages
  FOR UPDATE USING (auth.role() = 'authenticated');

-- El webhook escribe con service_role (bypassa RLS) — no necesita policy de INSERT.

-- ─── REALTIME ────────────────────────────────────────────────────────────────
-- Habilita notificaciones en tiempo real para el panel del agente.
-- (Ir a Supabase → Database → Replication y activar sek_messages)
ALTER PUBLICATION supabase_realtime ADD TABLE sek_messages;
