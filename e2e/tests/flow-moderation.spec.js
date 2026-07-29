import { test, expect } from '@playwright/test';
import { setupMocks, createMockState, seedDefaults, setAuthCookie } from '../helpers/mockApi.js';
import { AuthPage } from '../pages/AuthPage.js';
import { PostPage } from '../pages/PostPage.js';
import { ModQueuePage } from '../pages/ModQueuePage.js';
import { HeaderPage } from '../pages/HeaderPage.js';

test.describe('Moderation Flow', () => {
  test('Report post → login as mod → approve report → remove post → verify post gone from feed', async ({ page }) => {
    const state = createMockState();
    const { user, mod, post } = seedDefaults(state);
    await setupMocks(page, state);

    const auth = new AuthPage(page);
    const header = new HeaderPage(page);
    const postPage = new PostPage(page);
    const modQueue = new ModQueuePage(page);

    await auth.login(user.email, 'password123');
    await setAuthCookie(page, user);

    await postPage.goto(post._id);
    await postPage.waitForPostLoaded();
    await postPage.reportPost('Spam', 'This is spam content');

    const report = state.reports.find(r => r.target === post._id);
    expect(report).toBeTruthy();
    expect(report.reason).toBe('Spam');
    expect(report.status).toBe('pending');

    await header.logout();

    await auth.login(mod.email, 'password123');
    await setAuthCookie(page, mod);

    await modQueue.goto();
    await modQueue.waitForLoaded();

    const reportCount = await modQueue.getReportCount();
    expect(reportCount).toBeGreaterThanOrEqual(1);

    const reasonText = await modQueue.getFirstReportReason();
    expect(reasonText).toContain('Spam');

    await modQueue.removeFirstReport();

    const removedPost = state.posts.find(p => p._id === post._id);
    expect(removedPost.isRemoved).toBe(true);

    const resolvedReport = state.reports.find(r => r._id === report._id);
    expect(resolvedReport.status).toBe('removed');

    await page.goto('/home');
    await page.waitForLoadState('domcontentloaded');

    await postPage.expectPostNotVisible(post._id);
  });
});
