import { defineConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const DESKTOP_DIR = path.resolve(process.cwd(), 'packages/desktop');
const ELECTRON_DIST = path.resolve(
  process.cwd(),
  'node_modules/.pnpm/electron@28.3.3_supports-color@5.5.0/node_modules/electron/dist',
);
const ELECTRON_BIN = path.resolve(
  ELECTRON_DIST,
  process.platform === 'win32' ? 'electron.exe'
    : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron'
    : 'electron',
);
const electronAvailable = fs.existsSync(ELECTRON_BIN);

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'web',
      use: { browserName: 'chromium' },
    },
    {
      name: 'core-flows',
      testMatch: '**/flow-core*.spec.js',
      use: { browserName: 'chromium' },
    },
    ...(electronAvailable
      ? [
          {
            name: 'core-flows-electron',
            testMatch: '**/flow-core*.spec.js',
            use: {
              launchOptions: {
                executablePath: ELECTRON_BIN,
                args: [path.join(DESKTOP_DIR, 'main.mjs')],
                env: { ...process.env, NODE_ENV: 'test' },
              },
            },
          },
          {
            name: 'moderation-flows-electron',
            testMatch: '**/flow-moderation*.spec.js',
            use: {
              launchOptions: {
                executablePath: ELECTRON_BIN,
                args: [path.join(DESKTOP_DIR, 'main.mjs')],
                env: { ...process.env, NODE_ENV: 'test' },
              },
            },
          },
          {
            name: 'social-flows-electron',
            testMatch: '**/flow-social*.spec.js',
            use: {
              launchOptions: {
                executablePath: ELECTRON_BIN,
                args: [path.join(DESKTOP_DIR, 'main.mjs')],
                env: { ...process.env, NODE_ENV: 'test' },
              },
            },
          },
        ]
      : []),
    {
      name: 'responsive-layout',
      testMatch: '**/responsive-layout*.spec.js',
      use: { browserName: 'chromium' },
    },
    {
      name: 'empty-states',
      testMatch: '**/empty-states*.spec.js',
      use: { browserName: 'chromium' },
    },
    {
      name: 'error-states',
      testMatch: '**/error-states*.spec.js',
      use: { browserName: 'chromium' },
    },
    {
      name: 'electron',
      testMatch: '**/*desktop*.spec.js',
    },
    {
      name: 'electron-full-audit',
      testMatch: '**/electron-full-audit*.spec.js',
    },
    {
      name: 'font-audit',
      testMatch: '**/font-rendering*.spec.js',
      use: { browserName: 'chromium' },
    },
    {
      name: 'titlebar-tray-audit',
      testMatch: '**/titlebar-tray-audit*.spec.js',
      use: { browserName: 'chromium' },
    },
    {
      name: 'notification-platform-audit',
      testMatch: '**/notification-platform-audit*.spec.js',
    },
  ],
  webServer: {
    command: 'pnpm --filter web dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      VITE_API_URL: '/api',
    },
  },
});
