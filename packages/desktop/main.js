const { app, BrowserWindow, ipcMain, Tray, Menu, shell } = require('electron')
const path = require('path')
const Store = require('electron-store')

const store = new Store()

let mainWindow = null
let tray = null

const DEV_SERVER_URL = 'http://localhost:5173'
const isDev = !app.isPackaged

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,           // custom title bar (built Day 14)
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,       // security: no Node in renderer
      contextIsolation: true,       // security: isolate preload
      sandbox: true,                // security: sandboxed renderer
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../web/dist/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

// Window controls (for frameless window)
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())

// Settings (electron-store)
ipcMain.handle('settings:get', () => store.store)
ipcMain.handle('settings:set', (_, key, value) => {
  store.set(key, value)
  return true
})

// Update installer
ipcMain.on('app:install-update', () => {
  // Will be wired to electron-updater on Day 16
  console.log('Install update requested')
})

// Navigate renderer to a path
ipcMain.on('navigate', (_, path) => {
  mainWindow?.webContents.send('navigate', path)
})

// ── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Handle custom deep links: threadverse://community/reactjs
app.setAsDefaultProtocolClient('threadverse')

app.on('open-url', (event, url) => {
  event.preventDefault()
  const parsed = new URL(url)
  const deepPath = `/${parsed.host}${parsed.pathname}`
  mainWindow?.webContents.send('navigate', deepPath)
  mainWindow?.show()
  mainWindow?.focus()
})