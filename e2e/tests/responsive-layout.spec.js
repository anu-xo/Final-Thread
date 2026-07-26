import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1024, height: 768 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'wide', width: 1440, height: 900 },
];

const PAGES = [
  { name: 'home', url: '/home' },
  { name: 'login', url: '/login' },
  { name: 'register', url: '/register' },
  { name: 'communities', url: '/communities' },
  { name: 'submit', url: '/submit' },
  { name: 'search', url: '/search?q=test' },
  { name: 'ai-chat', url: '/ai/chat' },
  { name: 'settings', url: '/settings' },
  { name: 'profile', url: '/u/testuser' },
  { name: 'not-found', url: '/this-page-does-not-exist' },
];

test.describe('Responsive Layout Audit', () => {
  for (const viewport of VIEWPORTS) {
    test.describe(`${viewport.name} (${viewport.width}x${viewport.height})`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      for (const page of PAGES) {
        test(`${page.name} has no horizontal overflow`, async ({ page: p }) => {
          await p.goto(page.url);
          await p.waitForLoadState('networkidle');

          // Check for horizontal scrollbar
          const hasHorizontalScroll = await p.evaluate(() => {
            return document.documentElement.scrollWidth > document.documentElement.clientWidth;
          });
          expect(hasHorizontalScroll, `${page.name} has horizontal overflow at ${viewport.name}`).toBe(false);

          await p.screenshot({
            path: `e2e/screenshots/responsive/${viewport.name}/${page.name}.png`,
            fullPage: false,
          });
        });
      }
    });
  }

  test('header is fixed and visible on all viewports', async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/home');
      await page.waitForLoadState('networkidle');

      const header = page.locator('header');
      await expect(header).toBeVisible();
      await expect(header).toHaveCSS('position', 'fixed');

      // Verify header stays visible on scroll
      await page.evaluate(() => window.scrollBy(0, 500));
      await expect(header).toBeVisible();
    }
  });

  test('sidebar collapses to hamburger on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    // Sidebar should be hidden (translated off-screen)
    const sidebar = page.locator('aside');
    const sidebarBox = await sidebar.boundingBox();
    // On mobile, sidebar should be off-screen or very narrow
    if (sidebarBox) {
      expect(sidebarBox.x).toBeLessThan(0);
    }

    // Hamburger button should be visible
    const hamburger = page.locator('button[aria-label="Toggle sidebar"]');
    await expect(hamburger).toBeVisible();

    // Clicking hamburger should show sidebar
    await hamburger.click();
    await expect(sidebar).toHaveCSS('transform', /matrix/);
  });
});
