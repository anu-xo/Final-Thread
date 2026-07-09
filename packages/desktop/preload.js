import { contextBridge, ipcRenderer } from 'electron';

const createListener = (channel, callback) => {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('electronAPI', {
  // Notification
  showNotification: (title, body) =>
    ipcRenderer.invoke('show-notification', { title, body }),

  // Settings persistence
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (settings) => ipcRenderer.invoke('set-settings', settings),

  // Updates
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (_, info) => callback(info));
    return () => ipcRenderer.removeAllListeners('update-available');
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (_, info) => callback(info));
    return () => ipcRenderer.removeAllListeners('update-downloaded');
  },
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

  // Global Shortcut Listeners & Navigation Whitelist
  onNavigate: (callback) => createListener('navigate', callback),
  onFocusSearch: (callback) => createListener('focus-search', callback),
  onOpenAIChat: (callback) => createListener('open-ai-chat', callback),
});