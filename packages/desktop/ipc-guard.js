// packages/desktop/ipc-guard.js
// Shared IPC channel whitelist guard for main.mjs and sync.mjs

const ALLOWED_CHANNELS = new Set([
  // Window controls (frameless title-bar)
  'window:minimize',
  'window:maximize',
  'window:close',

  // Settings & persistent store
  'settings:get',
  'get-settings',
  'settings:set',
  'set-settings',
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

  // Theme change notification
  'theme:changed',

  // Reset & Quit
  'reset-and-quit',
]);

export function guard(channel) {
  if (!ALLOWED_CHANNELS.has(channel)) {
    const err = `[ipc-guard] Rejected unregistered channel: "${channel}"`;
    console.error(err);
    throw new Error(err);
  }
}

export default ALLOWED_CHANNELS;
