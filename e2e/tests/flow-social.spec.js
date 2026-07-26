import { test, expect } from '@playwright/test';
import { setupMocks, createMockState, seedDefaults, upsertUser, upsertCommunity, upsertPost } from '../helpers/mockApi.js';
import { AuthPage } from '../pages/AuthPage.js';
import { HeaderPage } from '../pages/HeaderPage.js';
import { PostPage } from '../pages/PostPage.js';
import { SearchPage } from '../pages/SearchPage.js';

test.describe('Social Flow', () => {
  test('Search → open post → comment → notification', async ({ page }) => {
    const state = createMockState();
    const { user, user2, community, post } = seedDefaults(state);
    await setupMocks(page, state);

    const auth = new AuthPage(page);
    const header = new HeaderPage(page);
    const postPage = new PostPage(page);
    const searchPage = new SearchPage(page);

    // ── 1. Login as user2 (alice) ──────────────────────────────────────
    await auth.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/home/, { timeout: 10000 });

    // ── 2. Search for the post ─────────────────────────────────────────
    await header.search('Welcome to E2E');
    await expect(page).toHaveURL(/\/search\?q=Welcome/, { timeout: 5000 });

    // Verify search results contain the post
    const postLinks = await searchPage.getPostResults();
    expect(postLinks.length).toBeGreaterThanOrEqual(1);

    // ── 3. Open the post from search results ───────────────────────────
    await searchPage.clickFirstPost();

    // Should navigate to the post detail page
    await expect(page).toHaveURL(new RegExp(`/posts/${post._id}|/post/${post._id}`), { timeout: 5000 });

    // Verify the post title is visible
    await expect(page.getByText(post.title)).toBeVisible({ timeout: 5000 });

    // ── 4. Add a comment ───────────────────────────────────────────────
    const commentText = 'Great post! Thanks for sharing.';
    await postPage.addComment(commentText);

    // Verify the comment was created in state
    const comment = state.comments.find(c => c.body.includes('Great post'));
    expect(comment).toBeTruthy();
    expect(comment.author.username).toBe(user.username);
    expect(comment.post).toBe(post._id);

    // ── 5. Verify notification was created for the post author ─────────
    const notification = state.notifications.find(
      n => n.user === user2._id && n.type === 'reply'
    );
    expect(notification).toBeTruthy();
    expect(notification.actor.username).toBe(user.username);

    // ── 6. Logout and login as post author (bob) ───────────────────────
    await header.logout();
    await auth.goto('/login');
    await page.getByLabel('Email').fill(user2.email);
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/home/, { timeout: 10000 });

    // ── 7. Check notification bell ─────────────────────────────────────
    await header.openNotifications();

    // Verify the notification dropdown is visible
    const notifDropdown = page.locator('.w-80.bg-white, .w-80.dark\\:bg-neutral-900');
    await expect(notifDropdown).toBeVisible({ timeout: 5000 });

    // Verify the notification content mentions the actor
    const notifText = await notifDropdown.textContent();
    expect(notifText).toContain(user.username);
  });

  test('Search shows communities and users', async ({ page }) => {
    const state = createMockState();
    const { user, community } = seedDefaults(state);
    await setupMocks(page, state);

    const auth = new AuthPage(page);
    const header = new HeaderPage(page);
    const searchPage = new SearchPage(page);

    // Login
    await auth.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/home/, { timeout: 10000 });

    // Search for community
    await header.search('E2E');
    await expect(page).toHaveURL(/\/search\?q=E2E/, { timeout: 5000 });

    // Verify community results appear
    const communityLinks = await searchPage.getCommunityResults();
    expect(communityLinks.length).toBeGreaterThanOrEqual(1);

    // Click on the community to navigate to it
    await searchPage.clickFirstCommunity();
    await expect(page).toHaveURL(/\/community\/e2e-testing/, { timeout: 5000 });
  });
});
