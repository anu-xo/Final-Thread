import { app, BrowserWindow, ipcMain, dialog, Notification, globalShortcut, nativeTheme, net, Tray, Menu, nativeImage, protocol, session } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { execFile } from 'child_process';
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
  'notification:ping-test',
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

  // Theme change notification (renderer → main for macOS titlebar overlay)
  'theme:changed',
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
 *
 * Platform-specific title bar strategy:
 *
 * macOS — Use titleBarStyle:'hiddenInset' so the native traffic-light buttons
 *   (close/minimise/zoom) appear in the top-left corner with standard macOS
 *   drag behaviour.  This gives users the expected platform feel without
 *   reimplementing traffic-light button art, hover states, or accessibility
 *   gestures.  The renderer adds left padding (env(titlebar-area-x) or a
 *   fixed offset) so page content doesn't slide under the buttons.
 *
 * Windows / Linux — Use frame:false for a fully custom title bar.
 *   The React TitleBar component renders min/max/close buttons that follow
 *   Fluent (Windows) and GNOME (Linux) hover conventions.  Window dragging
 *   is handled via -webkit-app-region:drag on the title bar element.
 */
function createWindow() {
  unregisterGlobalShortcuts();

  const isMac = process.platform === 'darwin';

  const windowOptions = {
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'build', 'icons', '1024x1024.png'),
    webPreferences: {
      nodeIntegration: false, // Security: no Node in renderer
      contextIsolation: true, // Security: isolate preload
      sandbox: true,          // Security: sandboxed renderer
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  };

  if (isMac) {
    // macOS: hiddenInset keeps native traffic-light buttons; no frame:false
    windowOptions.titleBarStyle = 'hiddenInset';
    windowOptions.titleBarOverlay = {
      height: 48,
      symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#000000',
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a1d' : '#ffffff',
    };
  } else {
    // Windows / Linux: fully custom title bar
    windowOptions.frame = false;
  }

  mainWindow = new BrowserWindow(windowOptions);

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
 *
 * Platform notes:
 *
 * Windows 10/11 — Taskbar auto-inverts monochrome tray icons via the
 *   undocumented "per-channel icon tinting" rule.  If the icon is a single
 *   non-transparent colour it will be recoloured to match the taskbar theme
 *   (light taskbar → dark icon, dark taskbar → light icon).  We supply two
 *   explicit PNGs (light-on-transparent for dark taskbars, dark-on-transparent
 *   for light taskbars) and swap them when `nativeTheme` changes, which is the
 *   most reliable approach.
 *
 * macOS — The menu bar expects a *template image* (1-bit alpha, no colour).
 *   Passing `template: true` to nativeImage tells AppKit to automatically
 *   invert the icon to contrast with the menu bar, so we only need one asset.
 *
 * Linux / GNOME — GNOME Shell (≥40) removed the classic notification area
 *   tray.  Ubuntu ships `gnome-shell-extension-appindicator` (SNI) which some
 *   users install, but it is NOT present by default.  KDE Plasma and XFCE
 *   panels do render tray icons natively.  We create the tray unconditionally
 *   so KDE/XFCE users get it; on GNOME the Tray constructor is a no-op if no
 *   supported panel extension is active.
 */
function getTrayIcon() {
  const isDark = nativeTheme.shouldUseDarkColors;
  const isMac = process.platform === 'darwin';

  if (isMac) {
    // macOS: Template images (suffix "Template" or setTemplateImage(true))
    // allow AppKit to auto-invert for the current menu-bar appearance.
    // nativeImage.createFromPath picks up tray-iconTemplate@2x.png
    // automatically on Retina displays — do NOT resize.
    const iconPath = path.join(__dirname, 'assets', 'tray-iconTemplate.png');
    const icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      // Graceful fallback if template file hasn't been generated yet
      return nativeImage.createFromPath(
        path.join(__dirname, 'assets', 'tray-icon.png'),
      );
    }
    icon.setTemplateImage(true);
    return icon;
  }

  // ── Windows / Linux ──────────────────────────────────────────────────────
  // Two explicit PNGs avoid relying on undocumented OS auto-tinting:
  //   tray-icon-light.png  — light glyph on transparent bg (for dark taskbars)
  //   tray-icon-dark.png   — dark glyph on transparent bg  (for light taskbars)
  //
  // HiDPI: nativeImage.createFromPath auto-selects the @2x variant when
  // present.  Do NOT call .resize() — it strips the scale factor and the
  // resulting icon renders at 1x on HiDPI screens.
  const fileName = isDark ? 'tray-icon-light.png' : 'tray-icon-dark.png';
  const themedPath = path.join(__dirname, 'assets', fileName);
  let icon = nativeImage.createFromPath(themedPath);

  if (icon.isEmpty()) {
    // Fallback: single base icon (Electron auto-tints monochrome on Win10+)
    icon = nativeImage.createFromPath(
      path.join(__dirname, 'assets', 'tray-icon.png'),
    );
  }

  // Never resize — let the OS handle DPI scaling.
  return icon;
}

function createTray() {
  tray = new Tray(getTrayIcon());

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

  // ── Swap tray icon when OS theme changes (Windows / Linux) ────────────────
  // On macOS the template image auto-inverts, so we only swap on other platforms.
  if (process.platform !== 'darwin') {
    nativeTheme.on('updated', () => {
      if (tray && !tray.isDestroyed()) {
        tray.setImage(getTrayIcon());
      }
    });
  }
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
  showPlatformNotification({ title: payload.title, body: payload.body });
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

// Theme change notification — renderer tells main process when the user
// switches theme so we can update macOS titlebar overlay colours.
safeOn('theme:changed', (_event, resolvedTheme) => {
  if (process.platform === 'darwin' && mainWindow && !mainWindow.isDestroyed()) {
    const isDark = resolvedTheme === 'dark';
    mainWindow.setTitleBarOverlay({
      symbolColor: isDark ? '#ffffff' : '#000000',
      backgroundColor: isDark ? '#1a1a1d' : '#ffffff',
    });
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
    showPlatformNotification({
      title: 'AI answered',
      body: `In r/${communityName}`,
      onClick: () => {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('navigate', { view: 'ai-chat', scrollToLatest: true });
      },
    });
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
safeOn('badge:test', async () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;

  if (process.platform === 'darwin') {
    app.dock.setBadge('1');
  } else if (process.platform === 'win32') {
    win.setOverlayIcon(createBadgeImage(1), '1 new notification');
  }

  await showPlatformNotification({
    title: 'ThreadVerse',
    body: 'Test notification — badge should appear on taskbar',
  });
});

// 10. Clickable Notifications
safeOn('notification:show', (_event, payload) => {
  if (typeof payload !== 'object' || payload === null) throw new Error('notification:show: payload must be an object');
  if (typeof payload.title !== 'string' || !payload.title.length) throw new Error('notification:show: payload must be a non-empty string');
  if (typeof payload.body !== 'string' || !payload.body.length) throw new Error('notification:show: payload must be a non-empty string');
  if (typeof payload.targetUrl !== 'string' || !payload.targetUrl.length) throw new Error('notification:show: targetUrl must be a non-empty string');

  showPlatformNotification({
    title: payload.title,
    body: payload.body,
    onClick: () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.show();
        win.focus();
        win.webContents.send('navigate', payload.targetUrl);
      }
    },
  });
});

  notification.show();
});

// ── Platform-Aware Notification Helper ───────────────────────────────────────
//
// macOS / Windows — Electron's Notification class uses the OS native notification
//   center (macOS Notification Center, Windows Action Center). No extra deps.
//
// Linux — Electron's Notification class uses libnotify under the hood, but only
//   when `libnotify` is installed.  On headless servers or minimal Docker images
//   it may be absent.  We detect this with Notification.isSupported() and fall
//   back to spawning `notify-send` (from the `libnotify-bin` package) directly.
//   If neither is available we return { supported: false } so the caller can
//   degrade gracefully (e.g. show an in-app toast instead).
//
// Decision: We keep Electron's Notification as the primary path because it
//   handles click events (needed for navigation).  The notify-send fallback
//   is fire-and-forget — no click handler — which is acceptable for test pings
//   and simple alerts where navigation isn't required.
async function showPlatformNotification({ title, body, onClick }) {
  const platform = process.platform;

  // macOS & Windows — native Notification API is always available
  if (platform === 'darwin' || platform === 'win32') {
    const notification = new Notification({ title, body });
    if (typeof onClick === 'function') {
      notification.on('click', onClick);
    }
    notification.show();
    return { backend: 'native', supported: true };
  }

  // Linux — try Electron's Notification (libnotify) first
  if (platform === 'linux') {
    // Notification.isSupported() checks for libnotify at runtime
    if (Notification.isSupported()) {
      const notification = new Notification({ title, body });
      if (typeof onClick === 'function') {
        notification.on('click', onClick);
      }
      notification.show();
      return { backend: 'native', supported: true };
    }

    // Fallback: spawn notify-send (from libnotify-bin / libnotify-tools)
    try {
      await new Promise((resolve, reject) => {
        execFile('notify-send', [title, body], { timeout: 5000 }, (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve();
        });
      });
      return { backend: 'notify-send', supported: true };
    } catch {
      console.warn('[notification] Linux: neither libnotify nor notify-send available');
      return { backend: 'unsupported', supported: false };
    }
  }

  return { backend: 'unsupported', supported: false };
}

// 11. Notification Ping Test — triggers a test notification and reports the backend used
safeHandle('notification:ping-test', async () => {
  const result = await showPlatformNotification({
    title: 'ThreadVerse',
    body: `Test notification — ${process.platform} (${new Date().toLocaleTimeString()})`,
  });
  return result;
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