import { createClient } from '@supabase/supabase-js';

const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Y3l4ZXJhY3ZmeHluZGR5amxkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTUxMTk1NCwiZXhwIjoyMDkxMDg3OTU0fQ.GlF4Zieqqc1V1IAPshPFKb1QzKBBbO8n1RGK_wG_JuM';

const admin = createClient(
  'https://kzcyxeracvfxynddyjld.supabase.co',
  SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ─── PASO 1: Deshabilitar RLS temporalmente para poder leer/escribir ──────────
// La única forma de crear policies desde el cliente es via pg-meta o SQL Editor.
// Como workaround: deshabilitamos RLS en sek_agent_config para que la app
// pueda leer perfiles sin restricción (la tabla no tiene datos sensibles —
// solo email, nombre, apellido, rol).

// Verificamos estado actual leyendo con service key (bypasea RLS)
const { data: rows, error: e1 } = await admin
  .from('sek_agent_config')
  .select('email, nombre, rol');

if (e1) {
  console.error('Error leyendo tabla:', e1.message);
  process.exit(1);
}
console.log('Filas en sek_agent_config:', rows.length);
rows.forEach(r => console.log(' -', r.email, r.rol));

// ─── PASO 2: Verificar login + lectura con anon key ───────────────────────────
const sb = createClient(
  'https://kzcyxeracvfxynddyjld.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Y3l4ZXJhY3ZmeHluZGR5amxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTE5NTQsImV4cCI6MjA5MTA4Nzk1NH0.DvEnK-g5rMxzFec4Fl3rJ5VDYVJ7-ua9ssqf3s-QKtU'
);

const { data: loginData, error: loginErr } = await sb.auth.signInWithPassword({
  email: 'cbatista@sekunet.com',
  password: 'Sekunet123'
});
if (loginErr) { console.error('Login error:', loginErr.message); process.exit(1); }
console.log('\nLogin OK. JWT email:', loginData.user.email);

const { data: perfil, error: e3 } = await sb
  .from('sek_agent_config')
  .select('email, nombre, rol')
  .eq('email', 'cbatista@sekunet.com')
  .maybeSingle();

if (e3) {
  console.log('RLS bloquea SELECT. Code:', e3.code, '| Msg:', e3.message);
  console.log('\n>>> SOLUCIÓN: Ejecutá este SQL en Supabase Dashboard → SQL Editor:\n');
  console.log(`
-- Paso 1: Crear función helper
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM sek_agent_config
    WHERE email = auth.jwt()->>'email' AND rol = 'superadmin'
  );
$$;

-- Paso 2: Policy SELECT (ver propio perfil)
DROP POLICY IF EXISTS "agente_ver_propio" ON sek_agent_config;
CREATE POLICY "agente_ver_propio" ON sek_agent_config
  FOR SELECT USING (email = auth.jwt()->>'email' OR is_superadmin());

-- Paso 3: Policy UPDATE
DROP POLICY IF EXISTS "agente_editar_propio" ON sek_agent_config;
CREATE POLICY "agente_editar_propio" ON sek_agent_config
  FOR UPDATE USING (email = auth.jwt()->>'email');

-- Paso 4: Policy INSERT
DROP POLICY IF EXISTS "agente_insertar_propio" ON sek_agent_config;
CREATE POLICY "agente_insertar_propio" ON sek_agent_config
  FOR INSERT WITH CHECK (email = auth.jwt()->>'email' OR is_superadmin());

-- Habilitar RLS
ALTER TABLE sek_agent_config ENABLE ROW LEVEL SECURITY;
  `);
} else if (!perfil) {
  console.log('Query OK pero sin fila. Insertando perfil...');
} else {
  console.log('Perfil leído con éxito:', JSON.stringify(perfil));
}
