-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 001: RLS + AUTH
-- Ejecutar en Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. ELIMINAR COLUMNA pass DE sek_agent_config ────────────────────────────
-- Supabase Auth maneja las contraseñas — nunca deben estar en una tabla custom.
ALTER TABLE sek_agent_config DROP COLUMN IF EXISTS pass;
ALTER TABLE sek_agent_config DROP COLUMN IF EXISTS api_key;  -- se mueve a Vault

-- ─── 2. HABILITAR RLS EN TODAS LAS TABLAS ────────────────────────────────────
ALTER TABLE sek_agent_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sek_cases          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sek_train          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sek_docs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sek_plantillas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sek_inventario     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sek_doc_chunks     ENABLE ROW LEVEL SECURITY;

-- ─── 3. TABLA sek_agent_config ───────────────────────────────────────────────
-- Cada agente solo ve y edita su propio perfil.
-- SuperAdmin puede ver todos (usando función helper).

CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM sek_agent_config
    WHERE email = auth.jwt()->>'email'
    AND rol = 'superadmin'
  );
$$;

DROP POLICY IF EXISTS "agente_ver_propio" ON sek_agent_config;
CREATE POLICY "agente_ver_propio" ON sek_agent_config
  FOR SELECT USING (
    email = auth.jwt()->>'email'
    OR is_superadmin()
  );

DROP POLICY IF EXISTS "agente_editar_propio" ON sek_agent_config;
CREATE POLICY "agente_editar_propio" ON sek_agent_config
  FOR UPDATE USING (email = auth.jwt()->>'email');

DROP POLICY IF EXISTS "superadmin_insertar" ON sek_agent_config;
CREATE POLICY "superadmin_insertar" ON sek_agent_config
  FOR INSERT WITH CHECK (is_superadmin());

DROP POLICY IF EXISTS "superadmin_eliminar" ON sek_agent_config;
CREATE POLICY "superadmin_eliminar" ON sek_agent_config
  FOR DELETE USING (
    is_superadmin()
    AND email != auth.jwt()->>'email'  -- no puede eliminar su propia cuenta
  );

-- ─── 4. TABLA sek_cases ──────────────────────────────────────────────────────
-- Todo agente autenticado puede ver y gestionar casos.
-- (Si en el futuro querés aislar por agente, agregá una columna agent_email)

DROP POLICY IF EXISTS "agentes_ver_casos" ON sek_cases;
CREATE POLICY "agentes_ver_casos" ON sek_cases
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "agentes_insertar_casos" ON sek_cases;
CREATE POLICY "agentes_insertar_casos" ON sek_cases
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "agentes_actualizar_casos" ON sek_cases;
CREATE POLICY "agentes_actualizar_casos" ON sek_cases
  FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "agentes_eliminar_casos" ON sek_cases;
CREATE POLICY "agentes_eliminar_casos" ON sek_cases
  FOR DELETE USING (auth.role() = 'authenticated');

-- ─── 5. TABLAS DE CONOCIMIENTO (sek_train, sek_docs, sek_plantillas) ─────────
-- Lectura: cualquier agente autenticado
-- Escritura/borrado: solo admin y superadmin

DROP POLICY IF EXISTS "leer_train" ON sek_train;
CREATE POLICY "leer_train" ON sek_train
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "admin_escribir_train" ON sek_train;
CREATE POLICY "admin_escribir_train" ON sek_train
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sek_agent_config
      WHERE email = auth.jwt()->>'email'
      AND rol IN ('admin','superadmin')
    )
  );

DROP POLICY IF EXISTS "leer_docs" ON sek_docs;
CREATE POLICY "leer_docs" ON sek_docs
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "admin_escribir_docs" ON sek_docs;
CREATE POLICY "admin_escribir_docs" ON sek_docs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sek_agent_config
      WHERE email = auth.jwt()->>'email'
      AND rol IN ('admin','superadmin')
    )
  );

DROP POLICY IF EXISTS "leer_plantillas" ON sek_plantillas;
CREATE POLICY "leer_plantillas" ON sek_plantillas
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "agentes_escribir_plantillas" ON sek_plantillas;
CREATE POLICY "agentes_escribir_plantillas" ON sek_plantillas
  FOR ALL USING (auth.role() = 'authenticated');

-- ─── 6. TABLA sek_inventario ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "agentes_inventario" ON sek_inventario;
CREATE POLICY "agentes_inventario" ON sek_inventario
  FOR ALL USING (auth.role() = 'authenticated');

-- ─── 7. TABLA sek_doc_chunks (RAG) ───────────────────────────────────────────
DROP POLICY IF EXISTS "agentes_ver_chunks" ON sek_doc_chunks;
CREATE POLICY "agentes_ver_chunks" ON sek_doc_chunks
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "admin_escribir_chunks" ON sek_doc_chunks;
CREATE POLICY "admin_escribir_chunks" ON sek_doc_chunks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sek_agent_config
      WHERE email = auth.jwt()->>'email'
      AND rol IN ('admin','superadmin')
    )
  );

-- ─── 8. TABLA DE AUDITORÍA (nueva) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sek_audit_log (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_email text NOT NULL,
  model_id    text,
  tokens_in   integer DEFAULT 0,
  tokens_out  integer DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE sek_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "solo_superadmin_audit" ON sek_audit_log;
CREATE POLICY "solo_superadmin_audit" ON sek_audit_log
  FOR SELECT USING (is_superadmin());

-- La Edge Function escribe con service_role (bypassa RLS), así que no necesita policy de INSERT.
