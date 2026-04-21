// ─── ESTADO GLOBAL CENTRALIZADO ──────────────────────────────────────────────
// Un solo objeto de estado. Ningún módulo muta variables globales sueltas.
// Para leer: import { state } from '../state.js'
// Para escribir: import { setState } from '../state.js'

import { ROLES } from './config.js';

export const state = {
  // Agente logueado
  currentAgent: {
    email    : '',
    nombre   : '',
    apellido : '',
    rol      : ROLES.TECNICO,
  },

  // Chat activo
  curChat    : 'cliente',   // 'tecnico' | 'cliente'
  curStage   : 'apertura',
  curCaseId  : null,
  currentModelIdx: 0,

  // Datos extraídos automáticamente
  clienteData : { nombre:null, correo:null, telefono:null, cuenta:null, ticket:null },
  equipoData  : { modelo:null, marca:null, tipo:null },
  clienteSaludado: false,
  intentosDatosCliente: 0,

  // Control del modo IA y escalamiento
  modoIA             : 'activo',    // 'activo' | 'pausado' | 'cerrado'
  esperandoRespN2    : false,       // true = IA preguntó si acepta N2, espera respuesta
  agentStatus        : 'disponible', // estado del agente logueado
  modoManual         : false,       // true = IA no disponible, agentes humanos atienden

  // Historiales del caso activo
  chatHistoryCliente : [],
  chatHistoryTecnico : [],

  // Colecciones cargadas desde Supabase
  cases     : [],
  trainData : [],
  docs      : [],
  plantillas: [],
  inventario: [],

  // Adjuntos pendientes de envío
  attachedImg : { cli:null, tec:null },
  attachedAud : { cli:null, tec:null },
  attachedDoc : { cli:null, tec:null },

  // Filtros de UI
  caseEstadoFilter : 'todos',
  convFilter       : 'todos',
  convSearch       : '',
  plantillaFilterCat: 'all',

  // Búsqueda técnica (siempre activa)
  modoBusquedaTecnica: true,
};

// ─── SETTER SEGURO ───────────────────────────────────────────────────────────
// Hace merge superficial — solo actualiza las claves que le pasás.
// Ejemplo: setState({ curChat: 'cliente' })
export function setState(partial) {
  Object.assign(state, partial);
}

// ─── RESET DATOS DE CASO ─────────────────────────────────────────────────────
export function resetCaseData() {
  state.clienteData           = { nombre:null, correo:null, telefono:null, cuenta:null, ticket:null };
  state.equipoData             = { modelo:null, marca:null, tipo:null };
  state.clienteSaludado        = false;
  state.intentosDatosCliente   = 0;
  state.modoIA                 = 'activo';
  state.esperandoRespN2        = false;
}
