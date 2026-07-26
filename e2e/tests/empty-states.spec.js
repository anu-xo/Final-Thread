import { test, expect } from '@playwright/test';

test.describe('Empty States', () => {
  test('PostFeed shows empty state when no posts exist', async ({ page }) => {
    // Mock API to return empty posts
    await page.route('**/api/posts**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { posts: [], meta: { total: 0 } } }),
      });
    });

    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    // Should show an empty state message, not a blank page
    const emptyMessage = page.locator('text=No posts yet').or(page.locator('text=No posts'));
    await expect(emptyMessage).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'e2e/screenshots/empty-states/post-feed.png' });
  });

  test('SearchPage shows zero-results state for empty query results', async ({ page }) => {
    await page.route('**/api/search**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { posts: [], communities: [], users: [] } }),
      });
    });

    await page.goto('/search?q=nonexistent');
    await page.waitForLoadState('networkidle');

    const zeroResults = page.locator('text=No results found').or(page.locator('text=No posts matched'));
    await expect(zeroResults.first()).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'e2e/screenshots/empty-states/search.png' });
  });

  test('UserManagementTable shows empty state', async ({ page }) => {
    await page.route('**/api/admin/users**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    const emptyRow = page.locator('text=No users found');
    await expect(emptyRow).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'e2e/screenshots/empty-states/user-management.png' });
  });

  test('PlatformBreakdownTable shows empty state', async ({ page }) => {
    await page.route('**/api/analytics/platform**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null }),
      });
    });

    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    const emptyState = page.locator('text=No platform data available');
    await expect(emptyState).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'e2e/screenshots/empty-states/platform-breakdown.png' });
  });

  test('HomePage shows empty subscribed state when subscribed but 0 posts', async ({ page }) => {
    // Mock the feed endpoint to return empty with noSubscriptions = false
    await page.route('**/api/posts/feed**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { noSubscriptions: false, hasMore: false } }),
      });
    });

    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    const emptyFeed = page.locator('text=No posts in your subscribed communities');
    await expect(emptyFeed).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'e2e/screenshots/empty-states/home-subscribed-empty.png' });
  });

  test('ModQueue shows empty state when no pending reports', async ({ page }) => {
    await page.route('**/api/mod/reports**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.goto('/mod/queue');
    await page.waitForLoadState('networkidle');

    const emptyQueue = page.locator('text=No pending reports');
    await expect(emptyQueue).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'e2e/screenshots/empty-states/mod-queue.png' });
  });
});
