const { contextBridge, ipcRenderer } = require('electron');

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
});