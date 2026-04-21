// ─── AUTENTICACIÓN ───────────────────────────────────────────────────────────
// Usa Supabase Auth oficial:
//  - Passwords hasheadas por Supabase (bcrypt internamente)
//  - Tokens JWT con expiración automática
//  - Sin contraseñas visibles en ninguna tabla
//
// La tabla sek_agent_config YA NO guarda pass. Solo guarda:
//   email, nombre, apellido, rol, created_at
// La API Key de Gemini vive en Supabase Vault (secreto del servidor).

import { sb } from '../db/supabase.js';
import { ROLES } from '../config.js';
import { showToast } from '../ui/toast.js';
import { state, setState } from '../state.js';

// ─── LOGIN ───────────────────────────────────────────────────────────────────
export async function doLogin(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    console.error('[doLogin] error:', error);
    showToast('Login incorrecto: ' + error.message, 'err', 4000);
    return false;
  }
  // Perfil puede fallar si RLS aun no tiene el token — igual dejamos entrar
  await loadAgentProfile(data.user.email).catch(e => console.warn('[doLogin] perfil:', e));
  // Si el perfil no cargó, usar datos mínimos del JWT
  if (!state.currentAgent.email) {
    setState({
      currentAgent: {
        email   : data.user.email,
        nombre  : data.user.user_metadata?.nombre  || data.user.email.split('@')[0],
        apellido: data.user.user_metadata?.apellido || '',
        rol     : ROLES.TECNICO,
      },
    });
  }
  return true;
}

// ─── REGISTRO ────────────────────────────────────────────────────────────────
export async function doRegister(email, password, nombre, apellido) {
  // 1. Crear usuario en Supabase Auth (con metadata para no perder los datos
  //    si el insert de perfil falla por RLS antes de confirmar el email)
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { nombre, apellido, rol: ROLES.TECNICO } },
  });
  if (error) {
    showToast('Error al registrar: ' + error.message, 'err', 4000);
    return false;
  }

  // 2. Intentar insertar perfil en sek_agent_config.
  //    Si hay sesión activa (email confirmation desactivado) el insert funciona.
  //    Si no hay sesión (email pending), el trigger de Supabase debe encargarse.
  const session = data?.session;
  if (session) {
    const { error: profErr } = await sb.from('sek_agent_config').insert({
      email,
      nombre,
      apellido,
      rol: ROLES.TECNICO,
      created_at: new Date().toISOString(),
    });
    if (profErr) {
      showToast('Cuenta creada pero error en perfil: ' + profErr.message, 'warn', 5000);
    }
  }

  showToast('Cuenta creada. Verificá tu email ✓', 'ok', 4000);
  return true;
}

// ─── LOGOUT ──────────────────────────────────────────────────────────────────
export async function doLogout() {
  await sb.auth.signOut();
  setState({
    currentAgent: { email:'', nombre:'', apellido:'', rol: ROLES.TECNICO },
    apiKey: '',
  });
  showToast('Sesión cerrada', 'info', 2000);
}

// ─── CARGA PERFIL DEL AGENTE ─────────────────────────────────────────────────
// Después del login, trae nombre/apellido/rol desde sek_agent_config.
// NO trae la api_key — esa la provee el servidor via Edge Function.
export async function loadAgentProfile(email) {
  const { data, error } = await sb
    .from('sek_agent_config')
    .select('email, nombre, apellido, rol')
    .eq('email', email)
    .maybeSingle();            // maybeSingle no lanza error si no encuentra fila

  if (error) {
    console.warn('[loadAgentProfile] RLS o error:', error.message);
  }

  if (data) {
    setState({
      currentAgent: {
        email   : data.email,
        nombre  : data.nombre  || '',
        apellido: data.apellido || '',
        rol     : data.rol      || ROLES.TECNICO,
      },
    });
    return;
  }

  // Fallback: leer desde user_metadata (guardado durante el signUp)
  const { data: { user } } = await sb.auth.getUser();
  if (user?.user_metadata?.nombre) {
    console.warn('[loadAgentProfile] usando user_metadata como fallback para', email);
    setState({
      currentAgent: {
        email,
        nombre  : user.user_metadata.nombre   || email.split('@')[0],
        apellido: user.user_metadata.apellido  || '',
        rol     : user.user_metadata.rol       || ROLES.TECNICO,
      },
    });
  }
}

// ─── ACTUALIZAR PERFIL ───────────────────────────────────────────────────────
export async function updateProfile(nombre, apellido, newPassword) {
  const updates = {};

  // Actualizar password via Supabase Auth (hashea automáticamente)
  if (newPassword) {
    if (newPassword.length < 8) {
      showToast('La contraseña debe tener al menos 8 caracteres', 'err');
      return false;
    }
    const { error: passErr } = await sb.auth.updateUser({ password: newPassword });
    if (passErr) {
      showToast('Error al cambiar contraseña: ' + passErr.message, 'err');
      return false;
    }
  }

  // Actualizar nombre/apellido en sek_agent_config
  if (nombre || apellido) {
    const { error } = await sb
      .from('sek_agent_config')
      .update({ nombre, apellido, updated_at: new Date().toISOString() })
      .eq('email', state.currentAgent.email);
    if (error) {
      showToast('Error guardando perfil: ' + error.message, 'err');
      return false;
    }
    setState({ currentAgent: { ...state.currentAgent, nombre, apellido } });
  }

  showToast('Perfil actualizado ✓', 'ok', 3000);
  return true;
}

// ─── RECUPERAR SESIÓN AL CARGAR ──────────────────────────────────────────────
// Llamar desde main.js al iniciar la app.
export async function restoreSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user?.email) {
    await loadAgentProfile(session.user.email);
    return true;
  }
  return false;
}
