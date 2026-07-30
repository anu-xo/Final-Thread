import { test, expect } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage.js';
import { HeaderPage } from '../pages/HeaderPage.js';
import { PostPage } from '../pages/PostPage.js';
import { SearchPage } from '../pages/SearchPage.js';
import { CommentPage } from '../pages/CommentPage.js';
import { NotificationsPage } from '../pages/NotificationsPage.js';

test.describe('Staging: Social Flow', () => {
  test('Search for bob post → open it → add comment → switch to bob → verify notification → mark read', async ({ page }) => {
    const auth = new AuthPage(page);
    const header = new HeaderPage(page);
    const postPage = new PostPage(page);
    const searchPage = new SearchPage(page);
    const commentPage = new CommentPage(page);
    const notifPage = new NotificationsPage(page);

    // 1. Login as alice
    await auth.login('alice@e2e.test', 'Password123!');
    await expect(page).toHaveURL(/\/home/, { timeout: 15000 });

    // 2. Search for bob's post
    await header.search('How to configure Playwright');
    await expect(page).toHaveURL(/\/search/, { timeout: 10000 });

    const postLinks = await searchPage.getPostResults();
    expect(postLinks.length).toBeGreaterThanOrEqual(1);

    // 3. Click the post
    await searchPage.clickFirstPost();
    await expect(page).toHaveURL(/\/posts\/|\/post\//, { timeout: 10000 });
    const postHeading = page.locator('h1').first();
    await expect(postHeading).toBeVisible({ timeout: 10000 });
    const postTitle = await postHeading.textContent();
    expect(postTitle).toContain('Playwright');

    // 4. Add a comment
    const commentText = 'Great post from staging E2E test!';
    await commentPage.addComment(commentText);
    await commentPage.expectCommentVisible(commentText);

    // 5. Logout
    await header.logout();

    // 6. Login as bob (post author)
    await auth.login('bob@e2e.test', 'Password123!');
    await expect(page).toHaveURL(/\/home/, { timeout: 15000 });

    // 7. Open notifications
    await notifPage.openDropdown();
    await notifPage.expectNotificationVisible('alice');

    // 8. Mark all as read
    await notifPage.markAllAsRead();
    await page.waitForTimeout(2000);
  });
});
