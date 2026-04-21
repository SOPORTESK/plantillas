-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 004: FIX RLS sek_agent_config
-- Ejecutar en Supabase → SQL Editor
--
-- Problema: la policy de INSERT requería is_superadmin() que a su vez lee
-- sek_agent_config — loop infinito para el primer agente.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Permitir que cualquier usuario autenticado inserte SU PROPIO perfil
--    (el email del perfil debe coincidir con el del JWT)
DO $$ BEGIN
  DROP POLICY IF EXISTS "agente_insertar_propio" ON sek_agent_config;
  DROP POLICY IF EXISTS "superadmin_insertar_otros" ON sek_agent_config;
  DROP POLICY IF EXISTS "agente_ver_propio" ON sek_agent_config;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP POLICY IF EXISTS "agente_insertar_propio" ON sek_agent_config;
CREATE POLICY "agente_insertar_propio" ON sek_agent_config
  FOR INSERT WITH CHECK (
    email = auth.jwt()->>'email'
  );

-- 2. Permitir leer perfil propio (o todos si es superadmin)
--    Ya estaba, pero lo recreamos para asegurar que incluya el caso de
--    un usuario recién registrado que aún no tiene fila (no bloquear)
DROP POLICY IF EXISTS "agente_ver_propio" ON sek_agent_config;
CREATE POLICY "agente_ver_propio" ON sek_agent_config
  FOR SELECT USING (
    email = auth.jwt()->>'email'
    OR is_superadmin()
  );

-- 3. Superadmin puede insertar perfiles de otros agentes también
DROP POLICY IF EXISTS "superadmin_insertar_otros" ON sek_agent_config;
CREATE POLICY "superadmin_insertar_otros" ON sek_agent_config
  FOR INSERT WITH CHECK (
    is_superadmin()
  );
