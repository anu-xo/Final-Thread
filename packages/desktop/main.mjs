import { app, BrowserWindow, ipcMain, dialog, Notification, globalShortcut, nativeTheme, net, Tray, Menu, nativeImage } from 'electron';
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
let tray = null;
let isQuitting = false;

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
    icon: path.join(__dirname, 'build', 'icons', 'png', '1024x1024.png'),
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

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:state-changed', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:state-changed', false);
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    unregisterGlobalShortcuts();
    mainWindow = null;
  });
}

/**
 * ── System Tray ───────────────────────────────────────────────────────────────
 */
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open ThreadVerse', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'Open AI Chat', click: () => {
      mainWindow?.show();
      mainWindow?.focus();
      mainWindow?.webContents.send('tray:open-ai-chat');
    }},
    { label: 'Check for Updates', click: () => {
      mainWindow?.webContents.send('tray:check-updates'); // wired fully on Day 16
    }},
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]);

  tray.setToolTip('ThreadVerse');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

// 1. Window controls (Frameless windows require synchronous `.on` events)
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => {
  if (mainWindow) {
    mainWindow.hide(); // minimize to tray instead of closing
  }
});

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

// Theme sync — used by inline <script> in index.html to prevent flash
ipcMain.on('theme:get-sync', (event) => {
  const theme = store.get('theme', 'system');
  if (theme === 'system') {
    event.returnValue = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  } else {
    event.returnValue = theme;
  }
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
ipcMain.handle('app:get-version', () => app.getVersion());

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

// 5b. Read file for upload (returns base64 — renderer converts to Blob)
ipcMain.handle('read-file-for-upload', async (_, filePath) => {
  const fileBuffer = await fs.readFile(filePath);
  const extension = path.extname(filePath).slice(1).toLowerCase();
  const mimeTypeMap = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return {
    base64: fileBuffer.toString('base64'),
    mimeType: mimeTypeMap[extension] || 'application/octet-stream',
    fileName: path.basename(filePath),
  };
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

// 8. Connectivity (renderer can query on demand)
ipcMain.handle('connectivity:check', () => checkConnectivity());

// 9. Badge Count (Dock on macOS, Overlay icon on Windows)

function createBadgeImage(count) {
  const size = 16;
  // For a real badge, replace this with a proper PNG asset in assets/
  const badge = nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAJklEQVQ4T2P8z8BQz0BFAMIAEP8/A5UB4wYYDYYRMAoGP5AYCYMXDAYAB68QEXjBzJoAAAAASUVORK5CYII=',
      'base64',
    ),
  );
  return badge.resize({ width: size, height: size });
}

ipcMain.on('badge:set', (_event, count) => {
  if (process.platform === 'darwin') {
    app.dock.setBadge(count > 0 ? String(count) : '');
  } else if (process.platform === 'win32') {
    const win = BrowserWindow.getAllWindows()[0];
    if (count > 0) {
      win?.setOverlayIcon(createBadgeImage(count), `${count} new notifications`);
    } else {
      win?.setOverlayIcon(null, '');
    }
  }
});

ipcMain.on('badge:clear', () => {
  if (process.platform === 'darwin') {
    app.dock.setBadge('');
  } else if (process.platform === 'win32') {
    const win = BrowserWindow.getAllWindows()[0];
    win?.setOverlayIcon(null, '');
  }
});

// 9b. Manual test trigger — remove after Day 16 socket wiring
ipcMain.on('badge:test', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;

  if (process.platform === 'darwin') {
    app.dock.setBadge('1');
  } else if (process.platform === 'win32') {
    win.setOverlayIcon(createBadgeImage(1), '1 new notification');
  }

  const notification = new Notification({
    title: 'ThreadVerse',
    body: 'Test notification — badge should appear on taskbar',
  });
  notification.show();
});

// 10. Clickable Notifications
ipcMain.on('notification:show', (_event, { title, body, targetUrl }) => {
  const notification = new Notification({ title, body });

  notification.on('click', () => {
    const win = BrowserWindow.getAllWindows()[0];

    if (win) {
      win.show();
      win.focus();
      win.webContents.send('navigate', targetUrl);
    }
  });

  notification.show();
});


// ── Connectivity Detection ──────────────────────────────────────────────────
const API_BASE = isDev ? 'http://localhost:5000' : 'https://your-production-api.com';
const CONNECTIVITY_INTERVAL = 10_000;

let lastOnlineState = null;

function checkConnectivity() {
  return new Promise((resolve) => {
    const req = net.request(`${API_BASE}/api/health`);
    req.on('response', (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.on('abort', () => resolve(false));
    req.setTimeout(5000, () => { req.abort(); resolve(false); });
    req.end();
  });
}

async function emitConnectivity() {
  const online = net.isOnline() && await checkConnectivity();
  if (online !== lastOnlineState) {
    lastOnlineState = online;
    mainWindow?.webContents.send('connectivity:changed', online);
  }
}

// ── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createTray();
  createWindow();

  // Connectivity polling
  emitConnectivity(); // immediate first check
  setInterval(emitConnectivity, CONNECTIVITY_INTERVAL);

  // Cold-start deep link (Windows/Linux): URL lands in argv when no prior instance exists
  const deepLinkArg = extractDeepLinkUrl(process.argv);
  if (deepLinkArg) handleDeepLink(deepLinkArg);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Keep app running in tray on Windows/Linux; only quit when explicitly requested
  if (process.platform === 'darwin' || isQuitting) app.quit();
});

// Unregister shortcuts cleanly when the application exits
app.on('will-quit', () => {
  unregisterGlobalShortcuts();
});

// Handle custom deep links: threadverse://community/reactjs
const PROTOCOL = 'threadverse';

function extractDeepLinkUrl(argv) {
  return argv.find((arg) =>
    arg.startsWith(`${PROTOCOL}://`) ||
    arg.startsWith(`--protocol-url=${PROTOCOL}://`)
  )?.replace(/^--protocol-url=/, '');
}

function handleDeepLink(url) {
  // threadverse://community/reactjs -> { type: 'community', param: 'reactjs' }
  const parsed = new URL(url);
  const type = parsed.hostname;      // 'community', 'post', 'user'
  const param = parsed.pathname.replace(/^\//, '');
  mainWindow?.webContents.send('deep-link:navigate', { type, param });
  mainWindow?.show();
  mainWindow?.focus();
}

// Windows/Linux: single-instance lock — second instance passes URL via argv
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const url = extractDeepLinkUrl(argv);
    if (url) handleDeepLink(url);
  });
}

// macOS: open-url event
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

if (process.defaultApp) {
  // dev mode: electron.exe needs explicit args
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}