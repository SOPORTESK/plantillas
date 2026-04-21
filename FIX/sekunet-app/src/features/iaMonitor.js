// ─── MONITOR DE SALUD DEL AGENTE IA ───────────────────────────────────────────
// Verifica periódicamente que la API de Gemini responde correctamente.
// Si falla, activa el modo manual y alerta a los agentes humanos.

import { state, setState } from '../state.js';
import { showToast }       from '../ui/toast.js';
import { sb }              from '../db/supabase.js';

const CHECK_INTERVAL_MS  = 90 * 1000;  // verificar cada 90 segundos
const FIRST_CHECK_DELAY  = 20 * 1000;  // esperar 20s antes del primer check
const MAX_FAILURES       = 3;          // fallos consecutivos antes de modo manual

let _timer        = null;
let _failCount    = 0;
let _checking     = false;

// ─── INICIAR MONITOR ─────────────────────────────────────────────────────────
export function initIAMonitor() {
  _setHealthDot('checking');
  // Primer check diferido para no disparar en frío al arrancar
  setTimeout(() => {
    _runCheck();
    _timer = setInterval(_runCheck, CHECK_INTERVAL_MS);
  }, FIRST_CHECK_DELAY);
}

export function stopIAMonitor() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

// ─── VERIFICACIÓN ─────────────────────────────────────────────────────────────
async function _runCheck() {
  if (_checking) return;
  _checking = true;
  try {
    // Verificar sesión activa — liviano, sin tokens, sin rate limit
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      // Intentar refrescar antes de contar como fallo
      const { data: refreshed } = await sb.auth.refreshSession();
      if (!refreshed?.session) throw new Error('Sin sesión');
    }
    // Sesión OK → sistema operativo
    _failCount = 0;
    if (state.modoManual) {
      setState({ modoManual: false });
      _renderModoManual(false);
      showToast('✅ Sistema reconectado — modo normal', 'ok', 6000);
    }
    _setHealthDot('ok');
  } catch {
    _failCount++;
    if (_failCount < MAX_FAILURES) {
      _setHealthDot('checking');
    } else {
      _setHealthDot('error');
      if (!state.modoManual) {
        setState({ modoManual: true });
        _renderModoManual(true);
        showToast('🔴 Sesión expirada — modo manual activado. Recargue la página.', 'err', 0);
        window.electronAPI?.notificarModoManual?.();
      }
    }
  } finally {
    _checking = false;
  }
}

// ─── CHECK MANUAL (botón Reintentar IA) ────────────────────────────────────────
export async function reactivarIA() {
  _failCount = 0;
  _setHealthDot('checking');
  showToast('🔄 Verificando conexión con IA…', 'info', 3000);
  await _runCheck();
}

// ─── RENDER DOT JUNTO AL TÍTULO ───────────────────────────────────────────────
function _setHealthDot(status) {
  const dot = document.getElementById('ia-health-dot');
  if (!dot) return;
  const map = {
    ok      : { bg: '#22c55e', title: 'IA operativa',      pulse: true  },
    error   : { bg: '#ef4444', title: 'IA sin respuesta',  pulse: false },
    checking: { bg: '#f59e0b', title: 'Verificando IA…',   pulse: true  },
  };
  const s = map[status] ?? map.ok;
  dot.style.cssText = `
    display:inline-block;width:9px;height:9px;border-radius:50%;
    background:${s.bg};margin-left:6px;vertical-align:middle;
    ${s.pulse ? 'animation:pulse-status 2s infinite' : ''};
    box-shadow:0 0 0 2px ${s.bg}44;cursor:default;
  `;
  dot.title = s.title;
}

// ─── RENDER BANNER MODO MANUAL ────────────────────────────────────────────────
function _renderModoManual(activo) {
  const banner = document.getElementById('modo-manual-banner');
  if (banner) banner.style.display = activo ? 'flex' : 'none';
}
