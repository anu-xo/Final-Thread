const { contextBridge, ipcRenderer } = require('electron')

// Expose ONLY whitelisted, typed methods to the renderer
// Never expose raw ipcRenderer or Node.js APIs
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // Settings (electron-store)
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (key, value) => ipcRenderer.invoke('settings:set', key, value),

  // Updates
  installUpdate: () => ipcRenderer.send('app:install-update'),

  // Navigation (deep links trigger this)
  onNavigate: (callback) => ipcRenderer.on('navigate', (_, path) => callback(path)),

  // Notifications
  showNotification: (title, body) => {
    new Notification(title, { body }).onclick = () => {
      ipcRenderer.send('window:focus')
    }
  },

  // Check if running in Electron (used by useIsDesktop hook)
  isElectron: true,
})