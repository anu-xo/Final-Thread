/**
 * captureScreenshots.js — Automated screenshot capture for store listings.
 *
 * Uses Playwright to launch the Electron app, navigate to key screens,
 * and capture 1280×800 PNGs. Run AFTER seeding with seedScreenshots.js.
 *
 * Prerequisites:
 *   npm install -g playwright (or pnpm add -D playwright in the desktop package)
 *   npx playwright install chromium
 *
 * Usage:
 *   cd packages/desktop && node ../../scripts/screenshots/captureScreenshots.js
 *
 * Output:
 *   scripts/screenshots/output/{platform}/
 *     01-home-feed.png
 *     02-community-page.png
 *     03-ai-chat.png
 *     04-admin-dashboard.png
 *     05-settings.png
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Platform detection ───────────────────────────────────────────────────────
function detectPlatform() {
  const p = process.platform;
  if (p === 'win32') return 'windows';
  if (p === 'darwin') return 'macos';
  return 'linux';
}

const PLATFORM = detectPlatform();
const OUTPUT_DIR = resolve(__dirname, 'output', PLATFORM);
mkdirSync(OUTPUT_DIR, { recursive: true });

const WIDTH = 1280;
const HEIGHT = 800;

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'Demo1234!';

// ── Helpers ──────────────────────────────────────────────────────────────────
async function screenshot(page, name, opts = {}) {
  const path = resolve(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({
    path,
    fullPage: false,
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    ...opts,
  });
  console.log(`  [${PLATFORM}] ${name}.png`);
}

async function waitForSelector(page, selector, timeout = 10000) {
  await page.waitForSelector(selector, { timeout });
}

// ── Screenshots ──────────────────────────────────────────────────────────────
async function captureScreenshots() {
  console.log(`\n=== Capturing screenshots for ${PLATFORM} ===\n`);

  const browser = await chromium.launch({
    headless: false,
    args: [
      `--window-size=${WIDTH},${HEIGHT}`,
      '--no-sandbox',
      '--disable-gpu',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2, // Retina-quality screenshots
  });

  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  // ── 1. Login ───────────────────────────────────────────────────────────────
  console.log('1. Logging in...');
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');

  // Fill login form
  const usernameInput = page.locator('input[name="username"], input[placeholder*="username"], input[type="text"]').first();
  const passwordInput = page.locator('input[name="password"], input[placeholder*="password"], input[type="password"]').first();

  await usernameInput.fill(ADMIN_USER);
  await passwordInput.fill(ADMIN_PASS);

  // Submit
  const submitBtn = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")').first();
  await submitBtn.click();
  await page.waitForURL('**/feed**', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000); // Let animations settle

  // ── 2. Home Feed ───────────────────────────────────────────────────────────
  console.log('2. Capturing home feed...');
  await page.goto(`${BASE_URL}/feed`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await screenshot(page, '01-home-feed');

  // ── 3. Community Page ──────────────────────────────────────────────────────
  console.log('3. Capturing community page...');
  await page.goto(`${BASE_URL}/community/reactjs`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await screenshot(page, '02-community-page');

  // ── 4. AI Chat Panel ───────────────────────────────────────────────────────
  console.log('4. Capturing AI chat...');
  await page.goto(`${BASE_URL}/community/reactjs/chat`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Type a question to trigger the AI response
  const chatInput = page.locator('textarea, input[placeholder*="message"], input[placeholder*="chat"], input[placeholder*="ask"]').first();
  if (await chatInput.isVisible()) {
    await chatInput.fill('What are the best practices for React hooks?');
    const sendBtn = page.locator('button:has-text("Send"), button[type="submit"]').first();
    if (await sendBtn.isVisible()) {
      await sendBtn.click();
      await page.waitForTimeout(4000); // Wait for AI response
    }
  }
  await screenshot(page, '03-ai-chat');

  // ── 5. Admin Dashboard ─────────────────────────────────────────────────────
  console.log('5. Capturing admin dashboard...');
  await page.goto(`${BASE_URL}/admin`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await screenshot(page, '04-admin-dashboard');

  // ── 6. Settings ────────────────────────────────────────────────────────────
  console.log('6. Capturing settings...');
  await page.goto(`${BASE_URL}/settings`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await screenshot(page, '05-settings');

  // ── Done ───────────────────────────────────────────────────────────────────
  await browser.close();
  console.log(`\nDone! Screenshots saved to ${OUTPUT_DIR}`);
  console.log('Files:');
  const { readdirSync } = await import('fs');
  for (const f of readdirSync(OUTPUT_DIR).filter((f) => f.endsWith('.png'))) {
    const stats = await import('fs').then((fs) => fs.statSync(resolve(OUTPUT_DIR, f)));
    console.log(`  ${f} — ${(stats.size / 1024).toFixed(0)} KB`);
  }
}

captureScreenshots().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
