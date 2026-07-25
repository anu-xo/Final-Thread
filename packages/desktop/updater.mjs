import { autoUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron';

function send(channel, payload) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send('update-event', channel, payload);
  });
}

export function initAutoUpdater() {
  // AppImage does not support auto-update via electron-updater.
  // The running process IS the AppImage and cannot replace itself.
  // Users must re-download the new AppImage from GitHub Releases.
  if (process.platform === 'linux') {
    send('linux-no-auto-update', {
      message: 'AppImage updates require manual re-download from GitHub Releases.',
      url: 'https://github.com/anu-xo/Final-Thread/releases/latest',
    });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => send('checking-for-update'));
  autoUpdater.on('update-available', (info) => send('update-available', info));
  autoUpdater.on('update-not-available', () => send('update-not-available'));
  autoUpdater.on('download-progress', (progress) => send('download-progress', progress));
  autoUpdater.on('update-downloaded', (info) => send('update-downloaded', info));
  autoUpdater.on('error', (err) => send('error', { message: 'Update check failed' }));

  autoUpdater.checkForUpdatesAndNotify();
  setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 4 * 60 * 60 * 1000);
}

export { autoUpdater };
