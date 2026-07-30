import { test, expect } from '@playwright/test';

test('debug community page', async ({ page }) => {
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('response', resp => {
    if (resp.url().includes('community') || resp.url().includes('auth')) {
      console.log('RESP:', resp.status(), resp.url());
    }
  });
  page.on('requestfailed', req => console.log('REQ FAILED:', req.url()));

  // Login
  await page.goto('/login');
  await page.fill('#email', 'alice@e2e.test');
  await page.fill('#password', 'Password123!');
  await page.getByRole('button', { name: /^log in$/i }).click();
  await page.waitForURL(/\/home/, { timeout: 15000 });
  console.log('Logged in, URL:', page.url());

  // Go to community
  await page.goto('/r/e2e-testing');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  console.log('Community page URL:', page.url());

  // Check for buttons
  const joinBtn = page.getByRole('button', { name: /^join$/i });
  const joinedBtn = page.getByRole('button', { name: /^joined$/i });
  console.log('Join button visible:', await joinBtn.isVisible().catch(() => false));
  console.log('Joined button visible:', await joinedBtn.isVisible().catch(() => false));

  // Check page content
  const bodyText = await page.locator('body').textContent();
  console.log('Page contains Joined:', bodyText.includes('Joined'));
  console.log('Page contains joined:', bodyText.includes('joined'));

  // If Join button visible, click it
  if (await joinBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('Clicking Join button');
    await joinBtn.click();
    await page.waitForTimeout(2000);
    console.log('After click, Joined visible:', await joinedBtn.isVisible().catch(() => false));
    const bodyText2 = await page.locator('body').textContent();
    console.log('After click, page contains Joined:', bodyText2.includes('Joined'));
    console.log('After click, page contains Join:', bodyText2.includes('Join'));
  }
});
