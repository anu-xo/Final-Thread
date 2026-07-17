import { contextBridge, ipcRenderer } from 'electron';

// Helper to register IPC listeners and return an unsubscribe function
const createListener = (channel, callback) => {
  const handler = (_event, ...args) => {
    callback(...args);
  };

  ipcRenderer.on(channel, handler);

  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
};

// Badge helpers
export const setBadgeCount = (count) => {
  ipcRenderer.send('badge:set', count);
};

export const clearBadge = () => {
  ipcRenderer.send('badge:clear');
};

contextBridge.exposeInMainWorld('electronAPI', {
  // Notifications
  showNotification: (title, body) =>
    ipcRenderer.invoke('show-notification', { title, body }),

  notifyAIResponse: (communityName) =>
    ipcRenderer.send('ai-response-ready', communityName),

  // Settings
  getSettings: () =>
    ipcRenderer.invoke('settings:get'),

  setSettings: (partial) =>
    ipcRenderer.invoke('settings:set', partial),

  // Auto Updates
  checkForUpdates: () =>
    ipcRenderer.invoke('check-for-updates'),

  onUpdateAvailable: (callback) =>
    createListener('update-available', callback),

  onUpdateDownloaded: (callback) =>
    createListener('update-downloaded', callback),

  installUpdate: () =>
    ipcRenderer.invoke('install-update'),

  // File Picker
  selectFile: (options) =>
    ipcRenderer.invoke('select-file', options),

  // App Info
  getVersion: () =>
    ipcRenderer.invoke('get-version'),

  // Community Cache
  setSubscribedCommunities: (communities) =>
    ipcRenderer.invoke('set-subscribed-communities', communities),

  getSubscribedCommunities: () =>
    ipcRenderer.invoke('get-subscribed-communities'),

  // Embedding Cache
  getCachedEmbedding: (communityId, postId) =>
    ipcRenderer.invoke(
      'get-cached-embedding',
      communityId,
      postId
    ),

  // Global Shortcut Listeners
  onNavigate: (callback) =>
    createListener('navigate', callback),

  onFocusSearch: (callback) =>
    createListener('focus-search', callback),

  // Ctrl/Cmd + Shift + A
  onOpenAIChat: (callback) =>
    createListener('open-ai-chat', callback),

  // Badge
  setBadgeCount,
  clearBadge,
});