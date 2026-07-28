import { test, expect } from '@playwright/test';
import { setupMocks, createMockState, seedDefaults, upsertPost } from '../helpers/mockApi.js';
import { AuthPage } from '../pages/AuthPage.js';
import { HeaderPage } from '../pages/HeaderPage.js';
import { PostPage } from '../pages/PostPage.js';
import { SearchPage } from '../pages/SearchPage.js';

test.describe('Social Flow', () => {
  test('Search for post → open it → add comment → author gets notification → mark read', async ({ page }) => {
    const state = createMockState();
    const { user, user2, community } = seedDefaults(state);
    await setupMocks(page, state);

    // Bob (user2) authors the post so alice's comment creates a notification for bob
    const bobPost = upsertPost(state, {
      title: 'Bob tips for testing',
      body: 'A detailed guide on how to write great e2e tests.',
      author: user2,
      community,
    });

    const auth = new AuthPage(page);
    const header = new HeaderPage(page);
    const postPage = new PostPage(page);
    const searchPage = new SearchPage(page);

    // ── 1. Login as alice (user) ───────────────────────────────────────
    await auth.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/home/, { timeout: 10000 });

    // ── 2. Search for bob's post ───────────────────────────────────────
    await header.search('Bob tips');
    await expect(page).toHaveURL(/\/search\?q=Bob/, { timeout: 5000 });

    const postLinks = await searchPage.getPostResults();
    expect(postLinks.length).toBeGreaterThanOrEqual(1);

    // ── 3. Open the post from search results ───────────────────────────
    await searchPage.clickFirstPost();
    await expect(page).toHaveURL(new RegExp(`/posts/${bobPost._id}|/post/${bobPost._id}`), { timeout: 5000 });
    await expect(page.getByText(bobPost.title)).toBeVisible({ timeout: 5000 });

    // ── 4. Add a comment ───────────────────────────────────────────────
    const commentText = 'Great post! Thanks for sharing.';
    await postPage.addComment(commentText);

    const comment = state.comments.find(c => c.body.includes('Great post'));
    expect(comment).toBeTruthy();
    expect(comment.author.username).toBe(user.username);
    expect(comment.post).toBe(bobPost._id);

    // ── 5. Verify notification created for bob (post author) ───────────
    const notification = state.notifications.find(
      n => n.user === user2._id && n.type === 'reply'
    );
    expect(notification).toBeTruthy();
    expect(notification.actor.username).toBe(user.username);
    expect(notification.read).toBe(false);

    // ── 6. Logout and login as bob ─────────────────────────────────────
    await header.logout();
    await auth.goto('/login');
    await page.getByLabel('Email').fill(user2.email);
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/home/, { timeout: 10000 });

    // ── 7. Open notifications and verify ───────────────────────────────
    await header.openNotifications();

    const notifDropdown = page.locator('.w-80.bg-white, .w-80.dark\\:bg-neutral-900');
    await expect(notifDropdown).toBeVisible({ timeout: 5000 });

    const notifText = await notifDropdown.textContent();
    expect(notifText).toContain(user.username);

    // ── 8. Mark notification as read ───────────────────────────────────
    const markAllReadBtn = page.getByRole('button', { name: /mark all as read/i });
    if (await markAllReadBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await markAllReadBtn.click();
      await page.waitForTimeout(500);
    }

    // Verify notification is now marked as read in state
    const updatedNotif = state.notifications.find(n => n._id === notification._id);
    expect(updatedNotif.read).toBe(true);
  });
});
