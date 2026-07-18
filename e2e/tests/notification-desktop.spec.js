import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DESKTOP_DIR = path.resolve(__dirname, '../../packages/desktop');
const MAIN_ENTRY = path.join(DESKTOP_DIR, 'main.mjs');
const ELECTRON_BIN = path.resolve(
  __dirname,
  '../../node_modules/.pnpm/electron@28.3.3_supports-color@5.5.0/node_modules/electron/dist/electron.exe',
);

test.describe('Desktop notifications (Electron)', () => {
  let electronApp;

  test.beforeEach(async () => {
    electronApp = await electron.launch({
      executablePath: ELECTRON_BIN,
      args: [MAIN_ENTRY],
      env: { ...process.env, NODE_ENV: 'test' },
    });
  });

  test.afterEach(async () => {
    if (electronApp) await electronApp.close();
  });

  test('badge:set calls flashFrame on Windows', async () => {
    const page = await electronApp.firstWindow();

    // Install spy on flashFrame in the main process before triggering
    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      const origFlash = win.flashFrame.bind(win);
      win.__flashCalls = [];
      win.flashFrame = (...args) => {
        win.__flashCalls.push(args);
        return origFlash(...args);
      };
    });

    // Trigger badge:set from the renderer via preload API
    await page.evaluate(() => window.electronAPI?.setBadgeCount?.(5));

    // Assert the main-process spy captured the flashFrame call
    const flashCalls = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows()[0].__flashCalls;
    });
    expect(flashCalls).toContainEqual([true]);
  });

  test('badge:clear calls flashFrame(false) on Windows', async () => {
    const page = await electronApp.firstWindow();

    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      const origFlash = win.flashFrame.bind(win);
      win.__flashCalls = [];
      win.flashFrame = (...args) => {
        win.__flashCalls.push(args);
        return origFlash(...args);
      };
    });

    // First set a badge, then clear it
    await page.evaluate(() => window.electronAPI?.setBadgeCount?.(3));
    await page.evaluate(() => window.electronAPI?.clearBadge?.());

    const flashCalls = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows()[0].__flashCalls;
    });

    expect(flashCalls).toContainEqual([true]);
    expect(flashCalls).toContainEqual([false]);
  });

  test('badge:set calls dock.setBadge on macOS', async () => {
    const page = await electronApp.firstWindow();

    const isMac = await electronApp.evaluate(({ process }) => process.platform === 'darwin');
    test.skip(!isMac, 'dock.setBadge only exists on macOS');

    // Install spy on dock.setBadge in the main process
    await electronApp.evaluate(({ app }) => {
      const orig = app.dock.setBadge.bind(app.dock);
      app.__badgeCalls = [];
      app.dock.setBadge = (...args) => {
        app.__badgeCalls.push(args);
        return orig(...args);
      };
    });

    await page.evaluate(() => window.electronAPI?.setBadgeCount?.(7));

    const badgeCalls = await electronApp.evaluate(({ app }) => {
      return app.__badgeCalls;
    });
    expect(badgeCalls).toContainEqual(['7']);
  });

  test('notification:show fires from renderer and navigates on click', async () => {
    const page = await electronApp.firstWindow();

    // Spy on the notification:show IPC by listening for the event
    const notificationPromise = electronApp.evaluate(({ ipcMain }) => {
      return new Promise((resolve) => {
        ipcMain.once('notification:show', (_event, payload) => {
          resolve(payload);
        });
      });
    });

    // Trigger from renderer
    await page.evaluate(() =>
      window.electronAPI?.showOSNotification?.({
        title: 'Test',
        body: 'Hello from test',
        targetUrl: '/some/path',
      })
    );

    const payload = await notificationPromise;
    expect(payload).toEqual({
      title: 'Test',
      body: 'Hello from test',
      targetUrl: '/some/path',
    });
  });
});
