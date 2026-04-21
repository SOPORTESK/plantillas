// ─── PRESENCIA EN TIEMPO REAL ────────────────────────────────────────────────
// Usa Supabase Realtime Presence para mostrar agentes en línea y su estado.

import { sb } from '../db/supabase.js';
import { state, setState } from '../state.js';

let presenceChannel = null;

export const AGENT_STATUSES = {
  disponible : { label: 'Disponible',  color: '#16a34a', badge: '✓', badgeBg: '#bbf7d0' },
  ocupado    : { label: 'Ocupado',     color: '#1d4ed8', badge: '●', badgeBg: '#bfdbfe' },
  almorzando : { label: 'Almorzando',  color: '#b45309', badge: '☕', badgeBg: '#fde68a' },
  ausente    : { label: 'Ausente',     color: '#6b7280', badge: '—', badgeBg: '#e5e7eb' },
};

// ─── INICIAR PRESENCIA ────────────────────────────────────────────────────────
export function initPresence() {
  const agent = state.currentAgent;
  if (!agent?.email) return;

  // Estado inicial
  if (!state.agentStatus) setState({ agentStatus: 'disponible' });

  presenceChannel = sb.channel('agentes-online', {
    config: { presence: { key: agent.email } }
  });

  presenceChannel
    .on('presence', { event: 'sync' }, () => {
      _renderOnlineAgents(presenceChannel.presenceState());
    })
    .on('presence', { event: 'join' }, ({ key, newPresences }) => {
      const name = newPresences[0]?.nombre || key.split('@')[0];
      if (key !== agent.email) _showJoinToast(name, newPresences[0]?.status ?? 'disponible');
      _renderOnlineAgents(presenceChannel.presenceState());
    })
    .on('presence', { event: 'leave' }, () => {
      _renderOnlineAgents(presenceChannel.presenceState());
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await _trackPresence();
      }
    });

  _renderStatusSelector();

  // Cerrar menú al hacer clic fuera
  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('agent-status-selector');
    if (wrap && !wrap.contains(e.target)) {
      const menu = document.getElementById('agent-status-menu');
      if (menu) menu.style.display = 'none';
    }
  });
  // toggleAgentStatusMenu global
  window.toggleAgentStatusMenu = () => {
    const menu = document.getElementById('agent-status-menu');
    if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  };
}

// ─── ACTUALIZAR ESTADO PROPIO ──────────────────────────────────────────────────
export async function setAgentStatus(newStatus) {
  setState({ agentStatus: newStatus });
  await _trackPresence();
  _renderStatusSelector(false); // false = menú cerrado tras seleccionar
  _renderOnlineAgents(presenceChannel?.presenceState() ?? {});
}

async function _trackPresence() {
  if (!presenceChannel) return;
  const agent = state.currentAgent;
  await presenceChannel.track({
    nombre   : agent.nombre   || agent.email.split('@')[0],
    apellido : agent.apellido || '',
    rol      : agent.rol,
    status   : state.agentStatus ?? 'disponible',
    online_at: new Date().toISOString(),
  });
}

// ─── DETENER PRESENCIA (logout) ───────────────────────────────────────────────
export async function stopPresence() {
  if (presenceChannel) {
    await presenceChannel.untrack();
    await sb.removeChannel(presenceChannel);
    presenceChannel = null;
  }
  const el = document.getElementById('online-agents');
  if (el) el.innerHTML = '';
}

// ─── SELECTOR DE ESTADO (propio agente) ───────────────────────────────────────
function _renderStatusSelector(menuOpen = false) {
  const el = document.getElementById('agent-status-selector');
  if (!el) return;
  const cur    = state.agentStatus ?? 'disponible';
  const info   = AGENT_STATUSES[cur] ?? AGENT_STATUSES.disponible;
  const agent  = state.currentAgent;
  const nombre = agent?.nombre ? `${agent.nombre}${agent.apellido ? ' ' + agent.apellido : ''}` : 'Agente';
  const rolIcon = agent?.rol === 'superadmin' ? ' 👑' : agent?.rol === 'admin' ? ' ⚙️' : '';

  el.innerHTML = `
    <div class="agt-status-cur" onclick="toggleAgentStatusMenu()" title="Cambiar estado">
      <span style="background:${info.badgeBg};color:${info.color};font-size:10px;font-weight:900;width:16px;height:16px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;border:1.5px solid ${info.color};flex-shrink:0">${info.badge}</span>
      <span style="color:#fff;font-weight:600;font-size:13px">${nombre}${rolIcon}</span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div class="agt-status-menu" id="agent-status-menu" style="display:${menuOpen ? 'block' : 'none'}">
      ${Object.entries(AGENT_STATUSES).map(([k, v]) => `
        <div class="agt-status-opt${k === cur ? ' active' : ''}" onclick="setAgentStatus('${k}')">
          <span style="background:${v.badgeBg};color:${v.color};font-size:10px;font-weight:900;width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;border:1.5px solid ${v.color};flex-shrink:0">${v.badge}</span>
          <span style="color:${v.color};font-weight:600">${v.label}</span>
        </div>`).join('')}
    </div>`;
}

// ─── RENDER AGENTES EN LÍNEA ──────────────────────────────────────────────────
function _renderOnlineAgents(presenceState) {
  const el = document.getElementById('online-agents');
  if (!el) return;

  const myEmail = state.currentAgent.email;
  const others  = Object.entries(presenceState)
    .filter(([key]) => key !== myEmail)
    .flatMap(([, arr]) => arr);

  if (others.length === 0) { el.innerHTML = ''; return; }

  el.innerHTML = others.map(a => {
    const initials = _initials(a.nombre, a.apellido);
    const info     = AGENT_STATUSES[a.status] ?? AGENT_STATUSES.disponible;
    const rolIcon  = a.rol === 'superadmin' ? ' 👑' : a.rol === 'admin' ? ' ⚙️' : '';
    const label    = `${a.nombre || '?'}${rolIcon} — ${info.label}`;
    return `<span class="online-agent-dot" title="${label}"
      style="background:${info.color};border-color:${info.color};color:#fff">
      ${initials}
      <span class="online-dot-pulse" style="background:${info.badgeBg};color:${info.color};font-size:8px;font-weight:900;display:flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;border:1.5px solid #fff;position:absolute;bottom:-2px;right:-2px">${info.badge}</span>
    </span>`;
  }).join('');
}

// ─── BUSCAR AGENTE DISPONIBLE ──────────────────────────────────────────────────
export function getAgentesDisponibles() {
  if (!presenceChannel) return [];
  const myEmail = state.currentAgent.email;
  return Object.entries(presenceChannel.presenceState())
    .filter(([key]) => key !== myEmail)
    .flatMap(([key, arr]) => arr.map(a => ({ ...a, email: key })))
    .filter(a => a.status === 'disponible');
}

function _initials(nombre, apellido) {
  const n = (nombre || '?')[0].toUpperCase();
  const a = (apellido || '')[0]?.toUpperCase() || '';
  return n + a;
}

function _showJoinToast(nombre, status) {
  const info = AGENT_STATUSES[status] ?? AGENT_STATUSES.disponible;
  window.showToast?.(`${info.dot} ${nombre} — ${info.label}`, 'info', 3000);
}
