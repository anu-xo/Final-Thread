import { contextBridge, ipcRenderer } from 'electron';

// Helper to handle listener setup and returns a clean unsubscribe function
const createListener = (channel, callback) => {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('electronAPI', {
  // Notification
  showNotification: (title, body) =>
    ipcRenderer.invoke('show-notification', { title, body }),

  // Settings persistence (Updated to use the new namespaced channels)
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),

  // Updates (Refactored to use createListener for safer cleanup)
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateAvailable: (callback) =>
    createListener('update-available', callback),
  onUpdateDownloaded: (callback) =>
    createListener('update-downloaded', callback),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // File selection (for post image attachment — Day 7)
  selectFile: (options) => ipcRenderer.invoke('select-file', options),

  // App info
  getVersion: () => ipcRenderer.invoke('get-version'),

  // Community subscription cache
  setSubscribedCommunities: (communities) =>
    ipcRenderer.invoke('set-subscribed-communities', communities),
  getSubscribedCommunities: () =>
    ipcRenderer.invoke('get-subscribed-communities'),

  // Embedding cache
  getCachedEmbedding: (communityId, postId) =>
    ipcRenderer.invoke('get-cached-embedding', communityId, postId),

  // Global Shortcut Listeners & Navigation Whitelist
  onNavigate: (callback) => createListener('navigate', callback),
  onFocusSearch: (callback) => createListener('focus-search', callback),
  onOpenAIChat: (callback) => createListener('open-ai-chat', callback),
});