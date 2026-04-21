// ─── ELECTRON MAIN PROCESS ───────────────────────────────────────────────────
const { app, BrowserWindow, Notification, ipcMain, shell, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');

const DEV_URL  = 'http://localhost:5173';
const isDev    = process.env.NODE_ENV === 'development';
const APP_ICON = fs.existsSync(path.join(__dirname, '../public/logo.ico'))
  ? path.join(__dirname, '../public/logo.ico')
  : path.join(__dirname, '../public/logo.png');

if (process.platform === 'win32') {
  app.setAppUserModelId('com.sekunet.agente');
}

// Suprimir warnings de seguridad en desarrollo
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width          : 1400,
    height         : 900,
    minWidth       : 900,
    minHeight      : 600,
    title          : 'SEKUNET — Agente Técnico IA',
    icon           : APP_ICON,
    backgroundColor: '#0f172a',
    // Barra de título personalizada para incluir botones de navegación
    titleBarStyle  : 'default',
    webPreferences : {
      preload               : path.join(__dirname, 'preload.cjs'),
      nodeIntegration       : false,
      contextIsolation      : true,
      partition             : 'persist:sekunet',
      additionalArguments   : ['--disable-features=OutOfBlinkCors'],
    },
  });

  if (isDev) {
    win.loadURL(DEV_URL);
    // Abrir DevTools automáticamente en desarrollo
    win.webContents.once('did-finish-load', () => {
      win.webContents.openDevTools({ mode: 'detach' });
    });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }


  // Abrir links externos en el navegador del sistema
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ─── RECARGAR VENTANA ────────────────────────────────────────────────────────
ipcMain.on('recargar', () => {
  win?.webContents.reload();
});

// ─── NOTIFICACIÓN NATIVA DEL OS ───────────────────────────────────────────────
ipcMain.on('notificar-n2', (_, data) => {
  if (!Notification.isSupported()) return;
  const notif = new Notification({
    title  : '🔔 TRANSFERENCIA A NIVEL 2',
    body   : `Cliente: ${data.cliente}\nTeléfono: ${data.telefono}\nAsignado a: ${data.agente}`,
    icon   : APP_ICON,
    urgency: 'critical',
    timeoutType: 'never',
  });
  notif.on('click', () => { win?.show(); win?.focus(); });
  notif.show();
});

// ─── ALERTA DE MODO MANUAL ────────────────────────────────────────────────────
ipcMain.on('notificar-modo-manual', () => {
  if (!Notification.isSupported()) return;
  const notif = new Notification({
    title  : '⚠️ MODO MANUAL ACTIVO',
    body   : 'El agente IA no responde. Los agentes humanos deben atender directamente.',
    icon   : APP_ICON,
    urgency: 'critical',
  });
  notif.on('click', () => { win?.show(); win?.focus(); });
  notif.show();
});

app.whenReady().then(() => {
  // CSP header para eliminar warning de seguridad
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: wss: data: blob:;"
        ],
      },
    });
  });

  createWindow();

  // ── Menú con navegación ──────────────────────────────────────────────────
  const menu = Menu.buildFromTemplate([
    {
      label: 'Navegación',
      submenu: [
        {
          label      : '← Atrás',
          accelerator: 'Alt+Left',
          click       : () => win?.webContents.canGoBack()    && win.webContents.goBack(),
        },
        {
          label      : '→ Adelante',
          accelerator: 'Alt+Right',
          click       : () => win?.webContents.canGoForward() && win.webContents.goForward(),
        },
        { type: 'separator' },
        {
          label      : '⟳ Recargar',
          accelerator: 'F5',
          click       : () => win?.webContents.reload(),
        },
        {
          label      : 'Recargar sin caché',
          accelerator: 'Shift+F5',
          click       : () => win?.webContents.reloadIgnoringCache(),
        },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'togglefullscreen', label: 'Pantalla completa' },
        { role: 'zoomIn',  label: 'Acercar',  accelerator: 'CmdOrCtrl+=' },
        { role: 'zoomOut', label: 'Alejar',   accelerator: 'CmdOrCtrl+-' },
        { role: 'resetZoom', label: 'Zoom normal', accelerator: 'CmdOrCtrl+0' },
        ...(isDev ? [{ type: 'separator' }, { role: 'toggleDevTools', label: 'Herramientas de desarrollo' }] : []),
      ],
    },
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        { role: 'close',    label: 'Cerrar' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
