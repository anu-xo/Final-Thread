import { _electron as electron } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DESKTOP_DIR = path.resolve(__dirname, '../packages/desktop');
const MAIN_ENTRY = path.join(DESKTOP_DIR, 'main.mjs');
const ELECTRON_BIN = path.resolve(
  __dirname,
  '../node_modules/.pnpm/electron@28.3.3_supports-color@5.5.0/node_modules/electron/dist/electron.exe',
);

let electronApp = null;

export async function launchDesktop() {
  electronApp = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: [MAIN_ENTRY],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });
  return electronApp;
}

export async function closeDesktop() {
  if (electronApp) {
    await electronApp.close();
    electronApp = null;
  }
}
