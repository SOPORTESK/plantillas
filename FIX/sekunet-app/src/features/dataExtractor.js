// ─── EXTRACCIÓN AUTOMÁTICA DE DATOS DEL CLIENTE Y EQUIPO ─────────────────────

import { state, setState } from '../state.js';
import { updateChatTitles } from './chat.js';
import { renderClientePanel } from '../ui/clientePanel.js';

export function extraerDatosCliente(texto) {
  const d = { ...state.clienteData };
  let changed = false;

  // Correo
  if (!d.correo) {
    const m = texto.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    if (m) { d.correo = m[0]; changed = true; }
  }

  // Teléfono: acepta 8 dígitos solos (CR), con +506, espacios o guiones
  if (!d.telefono) {
    const m = texto.match(/(?:\+?506[\s-]?)?(\d{4}[\s.-]?\d{4})/);
    if (m) { d.telefono = m[1].replace(/[\s.-]/g, ''); changed = true; }
  }

  // Nombre: palabra clave o línea con 1-4 palabras alfabéticas (mayús. o minús.)
  if (!d.nombre) {
    const NAME_WORD = '[A-Za-zÁÉÍÓÚÑÜáéíóúñü]{2,}';
    const STOP = /^(el|la|los|las|mi|mis|tu|su|sus|de|del|al|a|en|con|para|por|que|es|esta|está|son|soy|cuenta|nombre|correo|email|tel[eé]fono|cel|movil|ticket|caso|hola|buenas|buenos|d[ií]as|tardes|noches|si|sí|no|ok|gracias|por favor|porfavor|bien|mal|usuario)$/i;
    let m = texto.match(new RegExp(`(?:me llamo|soy|mi nombre es|nombre[\\s:]+|titular[\\s:]+)((?:${NAME_WORD})(?:\\s+${NAME_WORD}){0,3})`, 'i'));
    if (!m) {
      const line = texto.split(/\n/).map(s => s.trim().replace(/[.,;:]+$/, ''))
        .find(s => {
          if (!new RegExp(`^(?:${NAME_WORD})(?:\\s+${NAME_WORD}){0,3}$`).test(s)) return false;
          const words = s.split(/\s+/);
          if (words.some(w => STOP.test(w))) return false;
          return words.length >= 1;
        });
      if (line) m = [null, line];
    }
    if (m) {
      const nombre = m[1].trim().split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      if (nombre.length >= 3) { d.nombre = nombre; changed = true; }
    }
  }

  // Cuenta registrada (si dice "a mi nombre" se usa el nombre; si aún no está, se difiere)
  const mencionaMismoNombre =
       /\b(?:a|bajo|con|en|es)\s+mi\s+(?:propio\s+)?nombre\b/i.test(texto)
    || /\b(?:a|en)\s+nombre\s+m[ií]o\b/i.test(texto)
    || /\bmi\s+mismo\s+nombre\b/i.test(texto)
    || /\bnombre\s+propio\b/i.test(texto)
    || /\ba\s+mi\s+propio\s+nombre\b/i.test(texto)
    || /\b(?:est[aá]|sale|figura|aparece|registrad[oa])\s+(?:a|bajo|en|con)\s+mi\s+nombre\b/i.test(texto)
    || /\bmisma\s+persona\b/i.test(texto)
    || /\bel\s+mismo\s+(?:que\s+)?mi\s+nombre\b/i.test(texto)
    || /\b(?:igual|mismo)\s+(?:que\s+)?mi\s+nombre\b/i.test(texto)
    || /\bmi\s+cuenta\s+personal\b/i.test(texto);
  if (mencionaMismoNombre) {
    if (d.nombre) { d.cuenta = d.nombre; changed = true; }
    else          { state.cuentaMismoNombre = true; }
  } else if (!d.cuenta) {
    const m = texto.match(/(?:cuenta(?: registrada)?(?: es|:)|registrad[oa] como|usuario)\s*[:]?\s*([A-Za-zÁÉÍÓÚÑáéíóúñ0-9][\wÁÉÍÓÚÑáéíóúñ .\-]{1,40})/i);
    if (m) { d.cuenta = m[1].trim().replace(/[.,;]+$/, ''); changed = true; }
  }

  // Resolución diferida: si ya sabemos el nombre y antes se marcó "a mi nombre"
  if (!d.cuenta && state.cuentaMismoNombre && d.nombre) {
    d.cuenta = d.nombre;
    state.cuentaMismoNombre = false;
    changed = true;
  }

  // Ticket: solo si el cliente lo menciona explícitamente
  if (!d.ticket) {
    const m = texto.match(/(?:ticket|caso|n[uú]mero de caso|n[uú]mero de ticket|folio|referencia)[\s:#]*([A-Z0-9][A-Z0-9-]{2,19})/i);
    if (m) { d.ticket = m[1].trim(); changed = true; }
  }

  if (changed) {
    setState({ clienteData: d });
    updateChatTitles();
    renderClientePanel();
  }

  if (
    texto.toLowerCase().includes('bienvenido') ||
    texto.toLowerCase().includes('hola') ||
    texto.toLowerCase().includes('saludos')
  ) {
    setState({ clienteSaludado: true });
  }
}

export function extraerDatosEquipo(texto) {
  const patterns = [
    /(DSC|Paradox|Bosch|Hikvision|Dahua|Axis|ZK[Tt]eco|HID)[\s]+([A-Z0-9]+[-]?[A-Z0-9]*)/i,
    /modelo[\s:]*([A-Z0-9]+[-]?[A-Z0-9]*)/i,
    /panel[\s]+([A-Z0-9]+)/i,
    /c[aá]mara[\s]+([A-Z0-9]+)/i,
  ];

  for (const pattern of patterns) {
    const match = texto.match(pattern);
    if (match) {
      const marca  = match[1] ?? 'Equipo';
      const modelo = match[2] ?? match[1];
      let tipo = 'Equipo';
      if (/DSC|Paradox|Bosch/i.test(marca))    tipo = 'Alarma';
      else if (/Hikvision|Dahua|Axis/i.test(marca)) tipo = 'CCTV';
      else if (/Hochiki|Notifier/i.test(marca)) tipo = 'Incendio';
      else if (/ZK[Tt]eco|HID/i.test(marca))   tipo = 'Acceso';
      setState({ equipoData: { modelo, marca, tipo } });
      updateChatTitles();
      renderClientePanel();
      break;
    }
  }
}
