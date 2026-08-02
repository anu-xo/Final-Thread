import { test, expect } from '@playwright/test';
import { setupMocks, createMockState, seedDefaults } from '../helpers/mockApi.js';

test('debug register', async ({ page }) => {
  const state = createMockState();
  seedDefaults(state);
  await setupMocks(page, state);

  // Listen for console messages
  page.on('console', msg => console.log('BROWSER:', msg.type(), msg.text()));
  page.on('response', async resp => {
    if (resp.url().includes('/api/')) {
      console.log('API RESPONSE:', resp.status(), resp.url());
    }
  });
  page.on('request', req => {
    if (req.url().includes('/api/')) {
      console.log('API REQUEST:', req.method(), req.url());
    }
  });

  await page.goto('/register');
  await page.waitForLoadState('networkidle');

  await page.getByLabel('Username').fill('newuser');
  await page.getByLabel('Email').fill('newuser@e2e.test');
  await page.getByLabel('Password').fill('Password123!');

  // Click the register button
  const btn = page.getByRole('button', { name: /register/i });
  console.log('Button count:', await btn.count());
  console.log('Button text:', await btn.textContent());

  await btn.click();
  await page.waitForTimeout(3000);

  console.log('URL after click:', page.url());

  // Check for errors
  const errorText = await page.locator('.text-amaranth').allTextContents();
  console.log('Error elements:', errorText);
});
