import { autoUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron';

function send(channel, payload) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send('update-event', channel, payload);
  });
}

export function initAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => send('checking-for-update'));
  autoUpdater.on('update-available', (info) => send('update-available', info));
  autoUpdater.on('update-not-available', () => send('update-not-available'));
  autoUpdater.on('download-progress', (progress) => send('download-progress', progress));
  autoUpdater.on('update-downloaded', (info) => send('update-downloaded', info));
  autoUpdater.on('error', (err) => send('error', { message: err.message }));

  autoUpdater.checkForUpdatesAndNotify();
  setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 4 * 60 * 60 * 1000);
}

export { autoUpdater };
