import { app, BrowserWindow, ipcMain, dialog, Notification, globalShortcut, nativeTheme, net, Tray, Menu, nativeImage, protocol, session } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import './sync.mjs';
import { initAutoUpdater, autoUpdater } from './updater.mjs';

// ── IPC Channel Whitelist ──────────────────────────────────────────────────
// Every channel the renderer is allowed to call must appear here.
// If an unregistered channel fires, the handler is rejected and logged.
const ALLOWED_CHANNELS = new Set([
  // Window controls (frameless title-bar)
  'window:minimize',
  'window:maximize',
  'window:close',

  // Settings & persistent store
  'settings:get',
  'get-settings',            // legacy alias
  'settings:set',
  'set-settings',            // legacy alias
  'settings:get-key',
  'settings:set-key',
  'set-last-community',
  'set-subscribed-communities',
  'get-subscribed-communities',

  // Theme (synchronous)
  'theme:get-sync',

  // Notifications
  'show-notification',
  'notification:show',
  'ai-response-ready',

  // File picker & upload helpers
  'select-file',
  'read-file-for-upload',

  // Navigation (main ↔ renderer)
  'navigate',

  // Updates
  'checkForUpdates',
  'installUpdate',
  'getAppVersion',
  'update-event',

  // Badge
  'badge:set',
  'badge:clear',
  'badge:test',

  // Connectivity
  'connectivity:check',

  // Background sync (embedding cache)
  'embedAndCachePosts',
  'logSyncBreadcrumb',

  // Online status check
  'net:isOnline',
]);

function guard(channel) {
  if (!ALLOWED_CHANNELS.has(channel)) {
    const err = `[ipc-guard] Rejected unregistered channel: "${channel}"`;
    console.error(err);
    throw new Error(err);
  }
}

/** Guarded wrapper — use instead of ipcMain.handle */
function safeHandle(channel, handler) {
  guard(channel);
  ipcMain.handle(channel, handler);
}

/** Guarded wrapper — use instead of ipcMain.on */
function safeOn(channel, handler) {
  guard(channel);
  ipcMain.on(channel, handler);
}

// Register custom scheme BEFORE app.ready — Origin sent by the renderer will be "electron://."
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'electron',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

// Initialize store with schema validation — malformed values reset to defaults
const store = new Store({
  schema: {
    theme: { type: 'string', enum: ['light', 'dark', 'system'], default: 'system' },
    fontSize: { type: 'string', enum: ['small', 'medium', 'large'], default: 'medium' },
    sidebarCollapsed: { type: 'boolean', default: false },
    defaultCommunitySort: { type: 'string', enum: ['hot', 'new', 'top', 'rising'], default: 'hot' },
    notificationSound: { type: 'boolean', default: true },
    aiChatAutoOpen: { type: 'boolean', default: false },
    lastViewedCommunity: { type: ['string', 'null'], default: null },
    subscribedCommunities: { type: 'array', default: [] },
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

  // Ctrl+Shift+A -> AI chat panel (scoped to last viewed community)
  globalShortcut.register('CommandOrControl+Shift+A', () => {
    if (!bringWindowToFront()) return;
    const lastCommunity = store.get('lastViewedCommunity', null);
    window.webContents.send('open-ai-chat', { communitySlug: lastCommunity });
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
    mainWindow.loadURL('electron://./index.html');
  }

  // ── Navigation limits (electronegativity HIGH fix) ──────────────────────
  // Prevent renderer from navigating away from the app origin or opening
  // arbitrary URLs via window.open / target="_blank" links.
  const ALLOWED_NAVIGATE_ORIGINS = [
    'electron://',
    ...(isDev ? [DEV_SERVER_URL] : []),
  ];

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = ALLOWED_NAVIGATE_ORIGINS.some((o) => url.startsWith(o));
    if (!allowed) {
      console.error(`[nav-guard] Blocked will-navigate to: ${url}`);
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const allowed = ALLOWED_NAVIGATE_ORIGINS.some((o) => url.startsWith(o));
    if (!allowed) {
      console.error(`[nav-guard] Blocked new-window to: ${url}`);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // ── Permission request handler (electronegativity MEDIUM fix) ────────────
  // Deny all permission requests (camera, microphone, geolocation, etc.)
  // unless explicitly needed. This app has no use for these APIs.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    console.error(`[permission] Denied "${permission}" from ${webContents.getURL()}`);
    callback(false);
  });

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
    { label: 'Ask AI', click: () => {
      mainWindow?.show();
      mainWindow?.focus();
      const lastCommunity = store.get('lastViewedCommunity', null);
      mainWindow?.webContents.send('open-ai-chat', { communitySlug: lastCommunity });
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

// ── Allowed file paths from select-file (prevents arbitrary path reads) ──
const allowedFilePaths = new Set();

// ── Store schema types (used by settings:set validation) ──────────────────
const STORE_SCHEMA = {
  theme:                   (v) => typeof v === 'string' && ['light','dark','system'].includes(v),
  fontSize:                (v) => typeof v === 'string' && ['small','medium','large'].includes(v),
  sidebarCollapsed:        (v) => typeof v === 'boolean',
  defaultCommunitySort:    (v) => typeof v === 'string' && ['hot','new','top','rising'].includes(v),
  notificationSound:       (v) => typeof v === 'boolean',
  aiChatAutoOpen:          (v) => typeof v === 'boolean',
  lastViewedCommunity:     (v) => v === null || typeof v === 'string',
  subscribedCommunities:   (v) => Array.isArray(v),
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const MIME_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  json: 'application/json',
};

function mimeTypeFromExt(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

// 1. Window controls (Frameless windows require synchronous `.on` events)
safeOn('window:minimize', () => mainWindow?.minimize());
safeOn('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
safeOn('window:close', () => {
  if (mainWindow) {
    mainWindow.hide(); // minimize to tray instead of closing
  }
});

// 2. Notifications
safeHandle('show-notification', (_, payload) => {
  if (typeof payload !== 'object' || payload === null) throw new Error('show-notification: payload must be an object');
  if (typeof payload.title !== 'string' || !payload.title.length) throw new Error('show-notification: title must be a non-empty string');
  if (typeof payload.body !== 'string' || !payload.body.length) throw new Error('show-notification: body must be a non-empty string');
  new Notification({ title: payload.title, body: payload.body }).show();
});

// 3. Settings & Storage (Includes Subscribed Communities Cache)
safeHandle('settings:get', () => store.store);
safeHandle('get-settings', () => store.store); // Legacy alias helper

safeHandle('settings:set', (event, partial) => {
  if (typeof partial !== 'object' || partial === null || Array.isArray(partial)) {
    throw new Error('settings:set: partial must be a plain object');
  }
  const allowedKeys = Object.keys(store.store);
  for (const key of Object.keys(partial)) {
    if (!allowedKeys.includes(key)) continue;
    const validator = STORE_SCHEMA[key];
    if (validator && !validator(partial[key])) {
      throw new Error(`settings:set: invalid value for "${key}"`);
    }
    store.set(key, partial[key]);
  }
  return store.store;
});

safeHandle('set-settings', (event, partial) => {
  if (typeof partial !== 'object' || partial === null || Array.isArray(partial)) {
    throw new Error('set-settings: partial must be a plain object');
  }
  const allowedKeys = Object.keys(store.store);
  for (const key of Object.keys(partial)) {
    if (!allowedKeys.includes(key)) continue;
    const validator = STORE_SCHEMA[key];
    if (validator && !validator(partial[key])) {
      throw new Error(`set-settings: invalid value for "${key}"`);
    }
    store.set(key, partial[key]);
  }
  return store.store;
});

// Theme sync — used by inline <script> in index.html to prevent flash
safeOn('theme:get-sync', (event) => {
  const theme = store.get('theme', 'system');
  if (theme === 'system') {
    event.returnValue = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  } else {
    event.returnValue = theme;
  }
});

// Last viewed community
safeOn('set-last-community', (_event, slug) => {
  if (typeof slug !== 'string') throw new Error('set-last-community: slug must be a string');
  store.set('lastViewedCommunity', slug);
});

// Individual setting accessors (background sync)
safeHandle('settings:get-key', (_event, key) => {
  if (typeof key !== 'string') throw new Error('settings:get-key: key must be a string');
  return store.get(key, null);
});

safeHandle('settings:set-key', (_event, key, value) => {
  if (typeof key !== 'string') throw new Error('settings:set-key: key must be a string');
  store.set(key, value);
  return { ok: true };
});

// Community subscription cache handlers
safeHandle('set-subscribed-communities', (_event, communities) => {
  if (!Array.isArray(communities)) throw new Error('set-subscribed-communities: must be an array');
  for (const c of communities) {
    if (typeof c !== 'string') throw new Error('set-subscribed-communities: each entry must be a string');
  }
  store.set('subscribedCommunities', communities);
  return { ok: true };
});

safeHandle('get-subscribed-communities', () => {
  return store.get('subscribedCommunities', []);
});

// 4. Updates & Version Check
safeHandle('checkForUpdates', () => {
  autoUpdater.checkForUpdatesAndNotify();
});
safeHandle('installUpdate', () => {
  autoUpdater.quitAndInstall();
});
safeHandle('getAppVersion', () => app.getVersion());

// 5. File Selection Native Dialogs
safeHandle('select-file', async (event, options = {}) => {
  if (options !== null && typeof options !== 'object') throw new Error('select-file: options must be an object');

  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    properties: ['openFile'],
    filters: options.filters || [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return options.readAs === 'dataUrl' ? { canceled: true, files: [] } : [];
  }

  // Whitelist every path the user picked so read-file-for-upload can use them
  for (const p of result.filePaths) allowedFilePaths.add(p);

  if (options.readAs === 'dataUrl') {
    const files = await Promise.all(result.filePaths.map(async (filePath) => {
      const fileBuffer = await fs.readFile(filePath);
      const mimeType = mimeTypeFromExt(filePath);

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
safeHandle('read-file-for-upload', async (_, filePath) => {
  if (typeof filePath !== 'string' || !filePath.length) {
    throw new Error('read-file-for-upload: filePath must be a non-empty string');
  }

  // Only allow paths returned by a prior select-file dialog
  if (!allowedFilePaths.has(filePath)) {
    throw new Error('read-file-for-upload: path not in select-file allowlist');
  }

  const fileBuffer = await fs.readFile(filePath);

  // Evict from allowlist after first use (one-shot)
  allowedFilePaths.delete(filePath);

  return {
    base64: fileBuffer.toString('base64'),
    mimeType: mimeTypeFromExt(filePath),
    fileName: path.basename(filePath),
  };
});

// 6. Navigation Helpers
safeOn('navigate', (_, path) => {
  mainWindow?.webContents.send('navigate', path);
});

// 7. AI Response Notification
safeOn('ai-response-ready', (event, communityName) => {
  if (typeof communityName !== 'string' || !communityName.length) {
    throw new Error('ai-response-ready: communityName must be a non-empty string');
  }
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
safeHandle('connectivity:check', () => checkConnectivity());

// 8b. Online status — lightweight OS-level check (no HTTP ping)
safeHandle('net:isOnline', () => net.isOnline());

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

safeOn('badge:set', (_event, count) => {
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
    throw new Error('badge:set: count must be a non-negative integer');
  }
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

safeOn('badge:clear', () => {
  if (process.platform === 'darwin') {
    app.dock.setBadge('');
  } else if (process.platform === 'win32') {
    const win = BrowserWindow.getAllWindows()[0];
    win?.setOverlayIcon(null, '');
  }
});

// 9b. Manual test trigger — remove after Day 16 socket wiring
safeOn('badge:test', () => {
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
safeOn('notification:show', (_event, payload) => {
  if (typeof payload !== 'object' || payload === null) throw new Error('notification:show: payload must be an object');
  if (typeof payload.title !== 'string' || !payload.title.length) throw new Error('notification:show: title must be a non-empty string');
  if (typeof payload.body !== 'string' || !payload.body.length) throw new Error('notification:show: body must be a non-empty string');
  if (typeof payload.targetUrl !== 'string' || !payload.targetUrl.length) throw new Error('notification:show: targetUrl must be a non-empty string');

  const notification = new Notification({ title: payload.title, body: payload.body });

  notification.on('click', () => {
    const win = BrowserWindow.getAllWindows()[0];

    if (win) {
      win.show();
      win.focus();
      win.webContents.send('navigate', payload.targetUrl);
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
  // Serve local files via the custom electron:// scheme in production
  if (!isDev) {
    const DIST_DIR = path.join(process.resourcesPath, 'web/dist');

    const MIME_TYPES = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
    };

    protocol.handle('electron', (req) => {
      const url = new URL(req.url);
      // electron://./index.html → /index.html
      const filePath = path.join(DIST_DIR, url.pathname === '/' ? 'index.html' : url.pathname);

      return net.fetch(`file://${filePath}`);
    });
  }

  createTray();
  createWindow();

  // Connectivity polling
  emitConnectivity(); // immediate first check
  setInterval(emitConnectivity, CONNECTIVITY_INTERVAL);

  // Auto-updater (checks on launch + every 4 hours)
  initAutoUpdater();

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