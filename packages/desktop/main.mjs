import { app, BrowserWindow, ipcMain, dialog, Notification, globalShortcut } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
// Initialize store with default settings schema
const store = new Store({
  defaults: {
    theme: 'system',
    fontSize: 'medium',
    sidebarCollapsed: false,
    defaultCommunitySort: 'hot',
    notificationSound: true,
    aiChatAutoOpen: false,
  },
});

let mainWindow = null;

const DEV_SERVER_URL = 'http://localhost:5173';
const isDev = !app.isPackaged;

// Resolve __dirname under ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Embedding cache store
const cacheStore = new Store({
  name: 'embedding-cache',
});

const MAX_CACHE_ENTRIES = 200;

/**
 * ── Global Shortcuts ─────────────────────────────────────────────────────────
 */
export function registerGlobalShortcuts(window) {
  if (!window) return;

  globalShortcut.unregisterAll();

  const bringWindowToFront = () => {
    if (!window || window.isDestroyed()) return false;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    window.webContents.focus();
    return true;
  };

  // Ctrl+N (Cmd+N on mac) -> new post
  globalShortcut.register('CommandOrControl+N', () => {
    if (!bringWindowToFront()) return;
    window.webContents.send('navigate', '/submit');
  });

  // Ctrl+K -> focus search
  globalShortcut.register('CommandOrControl+K', () => {
    if (!bringWindowToFront()) return;
    window.webContents.send('focus-search');
  });

  // Ctrl+Shift+A -> AI chat panel
  globalShortcut.register('CommandOrControl+Shift+A', () => {
    if (!bringWindowToFront()) return;
    window.webContents.send('open-ai-chat');
  });
}

export function unregisterGlobalShortcuts() {
  globalShortcut.unregisterAll();
}

/**
 * ── Embedding Cache ──────────────────────────────────────────────────────────
 */

export function getCachedEmbedding(communityId, postId) {
  const key = `${communityId}:${postId}`;
  const cache = cacheStore.get('entries', {});
  return cache[key] || null;
}

export function setCachedEmbedding(communityId, postId, data) {
  const key = `${communityId}:${postId}`;

  const cache = cacheStore.get('entries', {});
  const keys = Object.keys(cache);

  // Simple FIFO eviction (true LRU can be added later)
  if (keys.length >= MAX_CACHE_ENTRIES) {
    delete cache[keys[0]];
  }

  cache[key] = data;
  cacheStore.set('entries', cache);
}

/**
 * ── Window Management ────────────────────────────────────────────────────────
 */
function createWindow() {
  unregisterGlobalShortcuts();

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
    unregisterGlobalShortcuts();
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
ipcMain.handle('get-settings', () => store.store); // Legacy alias helper

ipcMain.handle('settings:set', (_, partial) => {
  store.set(partial);
  return store.store;
});

ipcMain.handle('set-settings', (_, settings) => {
  store.set(settings);
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

  if (result.canceled || result.filePaths.length === 0) {
    return options.readAs === 'dataUrl' ? { canceled: true, files: [] } : [];
  }

  if (options.readAs === 'dataUrl') {
    const files = await Promise.all(result.filePaths.map(async (filePath) => {
      const fileBuffer = await fs.readFile(filePath);
      const extension = path.extname(filePath).slice(1).toLowerCase();
      const mimeTypeMap = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
      };
      const mimeType = mimeTypeMap[extension] || 'application/octet-stream';

      return {
        path: filePath,
        name: path.basename(filePath),
        mimeType,
        dataUrl: `data:${mimeType};base64,${fileBuffer.toString('base64')}`,
      };
    }));

    return { canceled: false, files };
  }

  return result.filePaths;
});

// 6. Navigation Helpers
ipcMain.on('navigate', (_, path) => {
  mainWindow?.webContents.send('navigate', path);
});

// 7. AI Response Notification
ipcMain.on('ai-response-ready', (event, communityName) => {
  if (!mainWindow.isFocused()) {
    const notification = new Notification({
      title: 'AI answered',
      body: `In r/${communityName}`,
    });

    notification.on('click', () => {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('navigate', { view: 'ai-chat', scrollToLatest: true });
    });

    notification.show();
  }
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
  // packages/desktop/main.js (already has other globalShortcuts from Day 6)
  globalShortcut.register('CommandOrControl+Shift+A', () => {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('open-ai-chat');
  });
});