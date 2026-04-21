// ─── CONFIGURACIÓN CENTRAL ───────────────────────────────────────────────────
// Todas las constantes de la app en un solo lugar.
// Las variables VITE_ las lee Vite del archivo .env (nunca se suben a Git).

export const SB_URL  = import.meta.env.VITE_SB_URL;
export const SB_KEY  = import.meta.env.VITE_SB_ANON_KEY;

// Modelos Gemini disponibles (en orden de preferencia)
export const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  { id: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro' },
];

// Roles de agente
export const ROLES = {
  SUPERADMIN : 'superadmin',
  ADMIN      : 'admin',
  TECNICO    : 'tecnico',
};

// Etapas del caso
export const STAGES = ['apertura','relevamiento','gestion','resolucion','cierre'];
export const STAGE_NAMES = {
  apertura    : 'Apertura',
  relevamiento: 'Relevamiento',
  gestion     : 'Gestión',
  resolucion  : 'Resolución',
  cierre      : 'Cierre',
};

// Colores por etapa
export const CAT_COLORS = {
  apertura    : 'var(--s-ap)',
  relevamiento: 'var(--s-re)',
  gestion     : 'var(--s-ge)',
  resolucion  : 'var(--s-rs)',
  cierre      : 'var(--s-ci)',
};

// URL de la Edge Function que hace las llamadas a Gemini
// (la API key de Gemini vive SOLO en Supabase, nunca en el browser)
export const GEMINI_EDGE_URL = `${SB_URL}/functions/v1/gemini-proxy`;
export const RAG_EDGE_URL    = `${SB_URL}/functions/v1/rag-search`;
