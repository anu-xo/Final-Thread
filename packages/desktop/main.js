import { app, BrowserWindow, ipcMain, dialog, Notification, globalShortcut } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';

const store = new Store();

let mainWindow = null;

const DEV_SERVER_URL = 'http://localhost:5173';
const isDev = !app.isPackaged;

// Resolve __dirname under ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ── Global Shortcuts ─────────────────────────────────────────────────────────
 */
export function registerGlobalShortcuts(window) {
  if (!window) return;

  // Ctrl+N (Cmd+N on mac) -> new post
  globalShortcut.register('CommandOrControl+N', () => {
    window.show();
    window.focus();
    window.webContents.send('navigate', '/submit');
  });

  // Ctrl+K -> focus search
  globalShortcut.register('CommandOrControl+K', () => {
    window.show();
    window.focus();
    window.webContents.send('focus-search');
  });

  // Ctrl+Shift+A -> AI chat panel
  globalShortcut.register('CommandOrControl+Shift+A', () => {
    window.show();
    window.focus();
    window.webContents.send('open-ai-chat');
  });
}

export function unregisterGlobalShortcuts() {
  globalShortcut.unregisterAll();
}

/**
 * ── Window Management ────────────────────────────────────────────────────────
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,            // Custom title bar (built Day 14)
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false, // Security: no Node in renderer
      contextIsolation: true, // Security: isolate preload
      sandbox: true,          // Security: sandboxed renderer
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../web/dist/index.html'));
  }

  // Register shortcuts once the main window is created
  registerGlobalShortcuts(mainWindow);

  mainWindow.on('closed', () => { 
    mainWindow = null; 
  });
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

// 1. Window controls (Frameless windows require synchronous `.on` events)
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

// 2. Notifications
ipcMain.handle('show-notification', (_, { title, body }) => {
  new Notification({ title, body }).show();
});

// 3. Settings & Storage (Includes Subscribed Communities Cache)
ipcMain.handle('settings:get', () => store.store);
ipcMain.handle('get-settings', () => store.store); // Alias helper

ipcMain.handle('settings:set', (_, key, value) => {
  store.set(key, value);
  return true;
});
ipcMain.handle('set-settings', (_, settings) => {
  Object.entries(settings).forEach(([key, value]) => store.set(key, value));
  return store.store;
});

// Community subscription cache handlers
ipcMain.handle('set-subscribed-communities', (_event, communities) => {
  store.set('subscribedCommunities', communities);
  return { ok: true };
});

ipcMain.handle('get-subscribed-communities', () => {
  return store.get('subscribedCommunities', []);
});

// 4. Updates & Version Check (Wired for Day 16 hooks)
ipcMain.handle('check-for-updates', () => {
  console.log('Update check triggered from UI');
  // autoUpdater.checkForUpdates() — Day 16
});
ipcMain.on('app:install-update', () => console.log('Install update requested'));
ipcMain.handle('install-update', () => {
  console.log('Quit and install update requested');
  // autoUpdater.quitAndInstall() — Day 16
});
ipcMain.handle('get-version', () => app.getVersion());

// 5. File Selection Native Dialogs
ipcMain.handle('select-file', async (_, options = {}) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: options.filters || [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
  });
  return result.filePaths; // Returns array of selected file paths to renderer
});

// 6. Navigation Helpers
ipcMain.on('navigate', (_, path) => {
  mainWindow?.webContents.send('navigate', path);
});

// ── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Unregister shortcuts cleanly when the application exits
app.on('will-quit', () => {
  unregisterGlobalShortcuts();
});

// Handle custom deep links: threadverse://community/reactjs
app.setAsDefaultProtocolClient('threadverse');

app.on('open-url', (event, url) => {
  event.preventDefault();
  try {
    const parsed = new URL(url);
    const deepPath = `/${parsed.host}${parsed.pathname}`;
    mainWindow?.webContents.send('navigate', deepPath);
    mainWindow?.show();
    mainWindow?.focus();
  } catch (err) {
    console.error('Failed to parse deep link URL:', err);
  }
});