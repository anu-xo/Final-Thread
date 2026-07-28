import { test, expect } from '@playwright/test';
import { setupMocks, createMockState, seedDefaults } from '../helpers/mockApi.js';
import { AuthPage } from '../pages/AuthPage.js';
import { PostPage } from '../pages/PostPage.js';
import { ModQueuePage } from '../pages/ModQueuePage.js';
import { HeaderPage } from '../pages/HeaderPage.js';

test.describe('Moderation Flow', () => {
  test('Report post → login as mod → approve report → remove post → verify post gone from feed', async ({ page }) => {
    const state = createMockState();
    const { user, mod, community, post } = seedDefaults(state);
    await setupMocks(page, state);

    const auth = new AuthPage(page);
    const header = new HeaderPage(page);
    const postPage = new PostPage(page);
    const modQueue = new ModQueuePage(page);

    // ── 1. Login as regular user and report a post ─────────────────────
    await auth.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/home/, { timeout: 10000 });

    await postPage.goto(post._id);

    const reportBtn = page.getByRole('button', { name: /report/i });
    await expect(reportBtn).toBeVisible({ timeout: 5000 });
    await reportBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await page.locator('#report-reason').selectOption('Spam');
    await page.locator('#report-detail').fill('This is spam content');
    await page.getByRole('button', { name: /submit report/i }).click();

    const report = state.reports.find(r => r.target === post._id);
    expect(report).toBeTruthy();
    expect(report.reason).toBe('Spam');
    expect(report.status).toBe('pending');

    // ── 2. Logout ──────────────────────────────────────────────────────
    await header.logout();

    // ── 3. Login as moderator ──────────────────────────────────────────
    await auth.goto('/login');
    await page.getByLabel('Email').fill(mod.email);
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/home/, { timeout: 10000 });

    // ── 4. Navigate to mod queue ───────────────────────────────────────
    await modQueue.goto();
    await expect(page.getByRole('heading', { name: 'Moderation Queue' })).toBeVisible();

    const reportCount = await modQueue.getReportCount();
    expect(reportCount).toBeGreaterThanOrEqual(1);

    const reasonText = await modQueue.getFirstReportReason();
    expect(reasonText).toContain('Spam');

    // ── 5. Remove the post via the report ──────────────────────────────
    await modQueue.removeFirstReport();

    // Verify post is removed in state
    const removedPost = state.posts.find(p => p._id === post._id);
    expect(removedPost.isRemoved).toBe(true);

    // Verify report status updated
    const resolvedReport = state.reports.find(r => r._id === report._id);
    expect(resolvedReport.status).toBe('removed');

    // ── 6. Verify post no longer visible in feed ───────────────────────
    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    // The removed post should not appear in the feed
    const feedPost = page.locator(`a[href*="${post._id}"]`);
    await expect(feedPost).toHaveCount(0, { timeout: 5000 });
  });
});

async function headerLogout(page) {
  await page.getByRole('button', { name: /user menu/i }).click();
  await page.getByRole('menuitem', { name: /log out/i }).click();
}
