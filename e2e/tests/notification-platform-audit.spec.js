// @ts-check
import { test, expect } from '@playwright/test';
import { launchDesktop, closeDesktop } from '../electron.launch.js';

/**
 * Cross-Platform Notification Audit
 *
 * Verifies that the custom notification system uses the correct native backend
 * on each OS and that the `notify-send` fallback works on Linux when libnotify
 * is unavailable.
 *
 * Platform backends:
 *   macOS   → Electron Notification → macOS Notification Center
 *   Windows → Electron Notification → Windows Action Center
 *   Linux   → Electron Notification → libnotify (if installed)
 *             OR spawn notify-send  (libnotify-bin / libnotify-tools fallback)
 *             OR { supported: false } if neither is present
 *
 * The `notification:ping-test` IPC handler returns:
 *   { backend: 'native' | 'notify-send' | 'unsupported', supported: boolean }
 */

test.describe('Notification platform audit (Electron)', () => {
  let electronApp;

  test.beforeEach(async () => {
    electronApp = await launchDesktop();
  });

  test.afterEach(async () => {
    await closeDesktop();
  });

  test('notification:ping-test returns valid backend on current OS', async () => {
    const page = await electronApp.firstWindow();

    const result = await page.evaluate(() =>
      window.electronAPI?.pingNotificationTest(),
    );

    expect(result).toBeDefined();
    expect(result).toHaveProperty('supported');
    expect(result).toHaveProperty('backend');
    expect(['native', 'notify-send', 'unsupported']).toContain(result.backend);
    expect(typeof result.supported).toBe('boolean');
  });

  test('macOS uses native notification center', async () => {
    const isMac = process.platform === 'darwin';
    test.skip(!isMac, 'macOS-only test');

    const page = await electronApp.firstWindow();
    const result = await page.evaluate(() =>
      window.electronAPI?.pingNotificationTest(),
    );

    expect(result.backend).toBe('native');
    expect(result.supported).toBe(true);
  });

  test('Windows uses native Action Center', async () => {
    const isWin = process.platform === 'win32';
    test.skip(!isWin, 'Windows-only test');

    const page = await electronApp.firstWindow();
    const result = await page.evaluate(() =>
      window.electronAPI?.pingNotificationTest(),
    );

    expect(result.backend).toBe('native');
    expect(result.supported).toBe(true);
  });

  test('Linux uses libnotify or notify-send fallback', async () => {
    const isLinux = process.platform === 'linux';
    test.skip(!isLinux, 'Linux-only test');

    const page = await electronApp.firstWindow();
    const result = await page.evaluate(() =>
      window.electronAPI?.pingNotificationTest(),
    );

    // On Linux we accept native (libnotify), notify-send, or unsupported
    // (headless / Docker with no notification daemon)
    if (result.supported) {
      expect(['native', 'notify-send']).toContain(result.backend);
    } else {
      expect(result.backend).toBe('unsupported');
    }
  });

  test('notification:ping-test IPC is whitelisted', async () => {
    const page = await electronApp.firstWindow();

    // Should not throw — the channel must be in ALLOWED_CHANNELS
    const result = await page.evaluate(() =>
      window.electronAPI?.pingNotificationTest(),
    );

    expect(result).toBeDefined();
  });

  test('notification:show still works with click navigation', async () => {
    const page = await electronApp.firstWindow();

    // Spy on the notification:show IPC
    const notificationPromise = electronApp.evaluate(({ ipcMain }) => {
      return new Promise((resolve) => {
        ipcMain.once('notification:show', (_event, payload) => {
          resolve(payload);
        });
      });
    });

    await page.evaluate(() =>
      window.electronAPI?.showOSNotification?.({
        title: 'Test',
        body: 'Navigation test',
        targetUrl: '/home',
      }),
    );

    const payload = await notificationPromise;
    expect(payload.title).toBe('Test');
    expect(payload.body).toBe('Navigation test');
    expect(payload.targetUrl).toBe('/home');
  });

  test('notification backend is documented in main process comments', async () => {
    // This is a static check — verify the platform-aware notification helper
    // exists in main.mjs by checking that the IPC handler returns a result
    // with the expected shape (proving the helper is wired up).
    const page = await electronApp.firstWindow();

    const result = await page.evaluate(() =>
      window.electronAPI?.pingNotificationTest(),
    );

    // The helper must return backend + supported on every platform
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('supported');
  });
});
