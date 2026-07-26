import { test, expect } from '@playwright/test';
import { setupMocks, createMockState, seedDefaults, setAuthCookie } from '../helpers/mockApi.js';

test('debug: cookie auth flow', async ({ page }) => {
  const state = createMockState();
  const { user } = seedDefaults(state);
  await setupMocks(page, state);

  // Set cookie for the seeded user
  await setAuthCookie(page, user);
  console.log('[COOKIE SET]', user._id, user.email);

  page.on('request', (req) => {
    if (req.url().includes('/api/auth/')) {
      const h = req.headers();
      console.log(`[REQ] ${req.method()} ${req.url()}`);
      console.log(`  auth: ${h['authorization'] || 'none'}`);
      console.log(`  cookie: ${h['cookie'] || 'none'}`);
    }
  });
  page.on('response', (res) => {
    if (res.url().includes('/api/auth/')) {
      console.log(`[RES] ${res.status()} ${res.url()}`);
    }
  });

  // Full page reload - should use cookie for refresh
  await page.goto('/home');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  console.log('[FINAL URL]', page.url());
  const text = await page.locator('body').textContent();
  console.log('[BODY]', text?.substring(0, 300));
});
