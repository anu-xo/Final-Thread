import { defineConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const DESKTOP_DIR = path.resolve(process.cwd(), 'packages/desktop');

function findElectronBin() {
  const candidates = [
    path.resolve(
      process.cwd(),
      'node_modules/.pnpm/electron@28.3.3_supports-color@5.5.0/node_modules/electron/dist',
    ),
    path.resolve(process.cwd(), 'node_modules/electron/dist'),
    path.resolve(process.cwd(), 'node_modules/electron'),
  ];
  for (const dir of candidates) {
    const bin = path.resolve(
      dir,
      process.platform === 'win32' ? 'electron.exe'
        : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron'
        : 'electron',
    );
    if (fs.existsSync(bin)) return bin;
    if (fs.existsSync(path.resolve(dir, 'dist/electron'))) {
      return path.resolve(dir, 'dist/electron');
    }
  }
  try {
    const which = execSync('which electron 2>/dev/null || where electron 2>nul', { encoding: 'utf8' }).trim();
    if (which) return which;
  } catch {}
  return null;
}

const ELECTRON_BIN = findElectronBin();
const electronAvailable = ELECTRON_BIN !== null;

function electronProject(name, testMatch) {
  return {
    name,
    testMatch,
    use: {
      browserName: 'chromium',
      launchOptions: {
        executablePath: ELECTRON_BIN,
        args: [path.join(DESKTOP_DIR, 'main.mjs')],
        env: { ...process.env, NODE_ENV: 'test' },
      },
      viewport: { width: 1280, height: 800 },
    },
  };
}

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 60_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
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
    {
      name: 'moderation-flows',
      testMatch: '**/flow-moderation*.spec.js',
      use: { browserName: 'chromium' },
    },
    {
      name: 'social-flows',
      testMatch: '**/flow-social*.spec.js',
      use: { browserName: 'chromium' },
    },
    ...(electronAvailable
      ? [
          electronProject('core-flows-electron', '**/flow-core*.spec.js'),
          electronProject('moderation-flows-electron', '**/flow-moderation*.spec.js'),
          electronProject('social-flows-electron', '**/flow-social*.spec.js'),
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
