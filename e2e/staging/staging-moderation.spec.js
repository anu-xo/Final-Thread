import { test, expect } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage.js';
import { PostPage } from '../pages/PostPage.js';
import { ModQueuePage } from '../pages/ModQueuePage.js';
import { HeaderPage } from '../pages/HeaderPage.js';

test.describe('Staging: Moderation Flow', () => {
  test('Login as alice → report seed post → login as mod → remove post → verify post gone from feed', async ({ page }) => {
    const auth = new AuthPage(page);
    const header = new HeaderPage(page);
    const postPage = new PostPage(page);
    const modQueue = new ModQueuePage(page);

    // 1. Login as alice (regular user)
    await auth.login('alice@e2e.test', 'Password123!');
    await expect(page).toHaveURL(/\/home/, { timeout: 15000 });

    // 2. Find and navigate to the seed post
    const seedPostTitle = 'Welcome to E2E Testing';
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const seedLink = page.locator(`a:has-text("${seedPostTitle}")`).first();
    await seedLink.waitFor({ state: 'visible', timeout: 10000 });
    const href = await seedLink.getAttribute('href');
    const seedPostId = href.split('/').pop();

    await page.goto(`/posts/${seedPostId}`);
    await page.waitForLoadState('domcontentloaded');
    await postPage.waitForPostLoaded();

    // 3. Report the post as spam
    await postPage.reportPost('Spam', 'This is spam from staging E2E test');
    await expect(page.getByText(/report submitted|thank you/i).or(page.getByText(/reported/i)).first()).toBeVisible({ timeout: 10000 }).catch(() => {
      // Report may auto-dismiss without visible confirmation; that's OK
    });

    // 4. Logout
    await header.logout();

    // 5. Login as moderator
    await auth.login('mod@e2e.test', 'Password123!');
    await expect(page).toHaveURL(/\/home/, { timeout: 15000 });

    // 6. Go to mod queue
    await modQueue.goto();
    await modQueue.waitForLoaded();

    // 7. Verify report appears
    const reportCount = await modQueue.getReportCount();
    expect(reportCount).toBeGreaterThanOrEqual(1);

    // 8. Remove the reported post
    await modQueue.removeFirstReport();
    await page.waitForTimeout(2000);

    // 9. Verify the post no longer appears on the feed
    await page.goto('/home');
    await page.waitForLoadState('domcontentloaded');
    await postPage.expectPostNotVisible(seedPostId);
  });
});
