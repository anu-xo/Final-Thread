import { test, expect } from '@playwright/test';

test.describe('Error States', () => {
  test('network error shows styled error, not blank page', async ({ page }) => {
    await page.route('**/api/posts/feed**', (route) => {
      route.abort('connectionrefused');
    });

    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    // Should show an error message, not a blank page
    const errorMsg = page.locator('text=Unable to load').or(page.locator('text=Failed to load'));
    await expect(errorMsg.first()).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'e2e/screenshots/error-states/network-error.png' });
  });

  test('404 on post shows styled 404 page', async ({ page }) => {
    await page.route('**/api/posts/nonexistent**', (route) => {
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Post not found' }),
      });
    });

    await page.goto('/posts/nonexistent');
    await page.waitForLoadState('networkidle');

    const notFoundText = page.locator('text=Post not found');
    await expect(notFoundText).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'e2e/screenshots/error-states/post-404.png' });
  });

  test('404 on community shows styled 404 page', async ({ page }) => {
    await page.route('**/api/communities/nonexistent**', (route) => {
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Community not found' }),
      });
    });

    await page.goto('/r/nonexistent');
    await page.waitForLoadState('networkidle');

    const notFoundText = page.locator('text=Community not found');
    await expect(notFoundText).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'e2e/screenshots/error-states/community-404.png' });
  });

  test('404 on user shows styled 404 page', async ({ page }) => {
    await page.route('**/api/users/nonexistent**', (route) => {
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'User not found' }),
      });
    });

    await page.goto('/u/nonexistent');
    await page.waitForLoadState('networkidle');

    const notFoundText = page.locator('text=User not found');
    await expect(notFoundText).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'e2e/screenshots/error-states/user-404.png' });
  });

  test('500 on post shows styled error, not 404', async ({ page }) => {
    await page.route('**/api/posts/server-error**', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto('/posts/server-error');
    await page.waitForLoadState('networkidle');

    const errorText = page.locator('text=Something went wrong');
    await expect(errorText).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'e2e/screenshots/error-states/post-500.png' });
  });

  test('invalid route shows NotFoundPage', async ({ page }) => {
    await page.goto('/this-does-not-exist-at-all');
    await page.waitForLoadState('networkidle');

    const notFoundText = page.locator('text=Page not found');
    await expect(notFoundText).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'e2e/screenshots/error-states/404-route.png' });
  });

  test('CommentBox shows error feedback on failure', async ({ page }) => {
    await page.route('**/api/posts/*/comments', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Failed to post comment' }),
      });
    });

    await page.goto('/posts/test-post-id');
    await page.waitForLoadState('networkidle');

    // The error feedback should not crash the page
    await page.screenshot({ path: 'e2e/screenshots/error-states/comment-box.png' });
  });

  test('SectionErrorBoundary shows dark-mode-compatible error UI', async ({ page }) => {
    // Force dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Mock sidebar endpoint to fail
    await page.route('**/api/communities?limit=10**', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' }),
      });
    });

    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    await page.screenshot({ path: 'e2e/screenshots/error-states/dark-mode-error.png' });
  });
});
