/**
 * captureScreenshots.js — Automated screenshot capture for store listings.
 *
 * Uses Playwright to launch a headless Chromium browser, navigate to key screens,
 * and capture 1280×800 PNGs. Run AFTER seeding with seedScreenshots.js.
 *
 * Prerequisites:
 *   1. Seed demo data:   cd packages/server && node src/scripts/seedScreenshots.js
 *   2. Start server:     cd packages/server && node src/main.mjs
 *   3. Start web client: cd packages/web && pnpm dev
 *   4. Install Playwright: pnpm add -D playwright @playwright/test (root or desktop)
 *      npx playwright install chromium
 *
 * Usage:
 *   node scripts/screenshots/captureScreenshots.js
 *   node scripts/screenshots/captureScreenshots.js --platform windows
 *   node scripts/screenshots/captureScreenshots.js --base-url http://localhost:5173
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
import { mkdirSync, readdirSync, statSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

// ── Platform detection ───────────────────────────────────────────────────────
function detectPlatform() {
  if (getArg('platform')) return getArg('platform');
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
const SCALE_FACTOR = 2; // Retina-quality

const BASE_URL = getArg('base-url') || process.env.BASE_URL || 'http://localhost:5173';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'Demo1234!';

// ── Helpers ──────────────────────────────────────────────────────────────────
async function screenshot(page, name) {
  const path = resolve(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({
    path,
    fullPage: false,
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
  });
  const size = statSync(path).size;
  console.log(`  [${PLATFORM}] ${name}.png  (${(size / 1024).toFixed(0)} KB)`);
}

async function waitAndVerify(page, url, timeout = 15000) {
  await page.waitForURL(`**${url}*`, { timeout }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  // Extra settle time for React lazy loads, animations, and data fetches
  await page.waitForTimeout(1500);
}

// ── Screenshots ──────────────────────────────────────────────────────────────
async function captureScreenshots() {
  console.log(`\n=== Capturing screenshots for ${PLATFORM} ===`);
  console.log(`Resolution: ${WIDTH}×${HEIGHT} @${SCALE_FACTOR}x`);
  console.log(`Base URL:   ${BASE_URL}`);
  console.log(`Output:     ${OUTPUT_DIR}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      `--window-size=${WIDTH},${HEIGHT}`,
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: SCALE_FACTOR,
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  // ── 1. Login ───────────────────────────────────────────────────────────────
  console.log('1. Logging in as admin...');
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');

  // Fill login form — try multiple selectors for robustness
  const usernameInput = page.locator(
    'input[name="username"], input[placeholder*="username" i], input[type="text"]'
  ).first();
  const passwordInput = page.locator(
    'input[name="password"], input[placeholder*="password" i], input[type="password"]'
  ).first();

  await usernameInput.fill(ADMIN_USER);
  await passwordInput.fill(ADMIN_PASS);

  const submitBtn = page.locator(
    'button[type="submit"], button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Login")'
  ).first();
  await submitBtn.click();

  // Wait for redirect to home or feed
  await page.waitForTimeout(3000);
  await page.waitForLoadState('networkidle').catch(() => {});
  console.log('  Logged in.\n');

  // ── 2. Home Feed ───────────────────────────────────────────────────────────
  console.log('2. Capturing home feed...');
  await page.goto(`${BASE_URL}/home`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // Let posts render, images load
  await screenshot(page, '01-home-feed');

  // ── 3. Community Page ──────────────────────────────────────────────────────
  console.log('3. Capturing community page...');
  await page.goto(`${BASE_URL}/community/reactjs`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await screenshot(page, '02-community-page');

  // ── 4. AI Chat Panel ───────────────────────────────────────────────────────
  console.log('4. Capturing AI chat...');
  await page.goto(`${BASE_URL}/ai/chat?community=reactjs`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  // Type a question to trigger the AI response for a more compelling screenshot
  const chatInput = page.locator(
    'textarea, input[placeholder*="message" i], input[placeholder*="chat" i], input[placeholder*="ask" i], input[placeholder*="type" i]'
  ).first();

  if (await chatInput.isVisible().catch(() => false)) {
    await chatInput.fill('What are the best practices for React hooks?');
    const sendBtn = page.locator(
      'button:has-text("Send"), button[type="submit"], button[aria-label*="send" i]'
    ).first();

    if (await sendBtn.isVisible().catch(() => false)) {
      await sendBtn.click();
      // Wait for streaming AI response to populate
      await page.waitForTimeout(5000);
    }
  }
  await screenshot(page, '03-ai-chat');

  // ── 5. Admin Dashboard ─────────────────────────────────────────────────────
  console.log('5. Capturing admin dashboard...');
  await page.goto(`${BASE_URL}/admin`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // Let charts and stats load
  await screenshot(page, '04-admin-dashboard');

  // ── 6. Settings ────────────────────────────────────────────────────────────
  console.log('6. Capturing settings...');
  await page.goto(`${BASE_URL}/settings`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await screenshot(page, '05-settings');

  // ── Done ───────────────────────────────────────────────────────────────────
  await browser.close();

  console.log(`\nDone! ${5} screenshots saved to ${OUTPUT_DIR}`);
  console.log('\nFiles:');
  for (const f of readdirSync(OUTPUT_DIR).filter((f) => f.endsWith('.png'))) {
    const stats = statSync(resolve(OUTPUT_DIR, f));
    console.log(`  ${f} — ${(stats.size / 1024).toFixed(0)} KB`);
  }

  // Verify all 5 are present
  const required = [
    '01-home-feed.png',
    '02-community-page.png',
    '03-ai-chat.png',
    '04-admin-dashboard.png',
    '05-settings.png',
  ];
  const missing = required.filter((f) => !readdirSync(OUTPUT_DIR).includes(f));
  if (missing.length > 0) {
    console.error(`\n[ERROR] Missing screenshots: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log('\nAll 5 screenshots captured successfully.');
}

captureScreenshots().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
