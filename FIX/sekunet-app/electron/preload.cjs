// ─── PRELOAD — puente seguro entre Electron y la app web ─────────────────────
const { contextBridge, ipcRenderer } = require('electron');

// Suprimir warnings de seguridad en la consola del renderer
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

contextBridge.exposeInMainWorld('electronAPI', {
  // Recargar ventana sin perder sesión
  recargar: () => ipcRenderer.send('recargar'),

  // Notificación nativa N2
  notificarN2: (data) => ipcRenderer.send('notificar-n2', data),

  // Notificación modo manual
  notificarModoManual: () => ipcRenderer.send('notificar-modo-manual'),

  // Detectar si corre dentro de Electron
  isElectron: true,
});
