// ─── CLIENTE SUPABASE ────────────────────────────────────────────────────────
// Un solo cliente compartido por toda la app.
// Auth se maneja con Supabase Auth (NO con tabla custom + passwords en texto plano).

import { createClient } from '@supabase/supabase-js';
import { SB_URL, SB_KEY } from '../config.js';

export const sb = createClient(SB_URL, SB_KEY, {
  auth: {
    autoRefreshToken  : true,
    persistSession    : true,
    detectSessionInUrl: false,
    // Electron no implementa navigator.locks — desactivar para evitar errores
    lock              : (name, acquireTimeout, fn) => fn(),
  },
});

// ─── ESCUCHA CAMBIOS DE SESIÓN ───────────────────────────────────────────────
// Cualquier módulo puede importar onAuthChange para reaccionar al login/logout.
export function onAuthChange(callback) {
  return sb.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}
