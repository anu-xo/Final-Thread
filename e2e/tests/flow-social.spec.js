import { test, expect } from '@playwright/test';
import { setupMocks, createMockState, seedDefaults, upsertPost } from '../helpers/mockApi.js';
import { AuthPage } from '../pages/AuthPage.js';
import { HeaderPage } from '../pages/HeaderPage.js';
import { PostPage } from '../pages/PostPage.js';
import { SearchPage } from '../pages/SearchPage.js';
import { CommentPage } from '../pages/CommentPage.js';
import { NotificationsPage } from '../pages/NotificationsPage.js';

test.describe('Social Flow', () => {
  test('Search for post → open it → add comment → author gets notification → mark read', async ({ page }) => {
    const state = createMockState();
    const { user, user2, community } = seedDefaults(state);
    await setupMocks(page, state);

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
    const commentPage = new CommentPage(page);
    const notifPage = new NotificationsPage(page);

    await auth.login(user.email, 'password123');

    await header.search('Bob tips');
    await expect(page).toHaveURL(/\/search\?q=Bob/, { timeout: 10000 });

    const postLinks = await searchPage.getPostResults();
    expect(postLinks.length).toBeGreaterThanOrEqual(1);

    await searchPage.clickFirstPost();
    await expect(page).toHaveURL(new RegExp(`/posts/${bobPost._id}|/post/${bobPost._id}`), { timeout: 10000 });
    await expect(page.getByText(bobPost.title).first()).toBeVisible({ timeout: 10000 });

    const commentText = 'Great post! Thanks for sharing.';
    await commentPage.addComment(commentText);

    await expect(async () => {
      const comment = state.comments.find(c => c.body.includes('Great post'));
      expect(comment).toBeTruthy();
      expect(comment.author.username).toBe(user.username);
      expect(comment.post).toBe(bobPost._id);
    }).toPass({ timeout: 10000 });

    const notification = state.notifications.find(
      n => n.user === user2._id && n.type === 'reply'
    );
    expect(notification).toBeTruthy();
    expect(notification.actor.username).toBe(user.username);
    expect(notification.read).toBe(false);

    await header.logout();

    await auth.login(user2.email, 'password123');

    await notifPage.openDropdown();
    await notifPage.expectNotificationVisible(user.username);

    await notifPage.markAllAsRead();

    const updatedNotif = state.notifications.find(n => n._id === notification._id);
    expect(updatedNotif.read).toBe(true);
  });
});
