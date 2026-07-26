import { test, expect } from '@playwright/test';
import { setupMocks, createMockState, seedDefaults, upsertUser, upsertCommunity, upsertPost } from '../helpers/mockApi.js';
import { AuthPage } from '../pages/AuthPage.js';
import { PostPage } from '../pages/PostPage.js';
import { ModQueuePage } from '../pages/ModQueuePage.js';

test.describe('Moderation Flow', () => {
  test('Report post → login as mod → mod queue → dismiss', async ({ page }) => {
    const state = createMockState();
    const { user, mod, community, post } = seedDefaults(state);
    await setupMocks(page, state);

    const auth = new AuthPage(page);
    const postPage = new PostPage(page);
    const modQueue = new ModQueuePage(page);

    // ── 1. Login as regular user and report a post ─────────────────────
    await auth.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/home/, { timeout: 10000 });

    // Navigate to the post and report it
    await postPage.goto(post._id);

    // Click report button
    const reportBtn = page.getByRole('button', { name: /report/i });
    await expect(reportBtn).toBeVisible({ timeout: 5000 });
    await reportBtn.click();

    // Fill in the report dialog
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Select reason
    await page.locator('#report-reason').selectOption('Spam');

    // Add detail
    await page.locator('#report-detail').fill('This is spam content');

    // Submit
    await page.getByRole('button', { name: /submit report/i }).click();

    // Verify report was created in state
    const report = state.reports.find(r => r.target === post._id);
    expect(report).toBeTruthy();
    expect(report.reason).toBe('Spam');
    expect(report.status).toBe('pending');

    // ── 2. Logout ──────────────────────────────────────────────────────
    await headerLogout(page);

    // ── 3. Login as moderator ──────────────────────────────────────────
    await auth.goto('/login');
    await page.getByLabel('Email').fill(mod.email);
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/home/, { timeout: 10000 });

    // ── 4. Navigate to mod queue ───────────────────────────────────────
    await modQueue.goto();
    await expect(modQueue.getHeading()).resolves.toBe('Moderation Queue');

    // Verify the report appears in the queue
    const reportCount = await modQueue.getReportCount();
    expect(reportCount).toBeGreaterThanOrEqual(1);

    // Verify report reason is visible
    const reasonText = await modQueue.getFirstReportReason();
    expect(reasonText).toContain('Spam');

    // ── 5. Dismiss the report ──────────────────────────────────────────
    await modQueue.dismissFirstReport();

    // Verify the report was dismissed in state
    const dismissedReport = state.reports.find(r => r._id === report._id);
    expect(dismissedReport.status).toBe('dismissed');

    // Queue should now be empty
    await expect(modQueue.isEmpty()).toBeVisible({ timeout: 5000 });
  });

  test('Report post → login as mod → mod queue → remove', async ({ page }) => {
    const state = createMockState();
    const { user, mod, community, post } = seedDefaults(state);
    await setupMocks(page, state);

    const auth = new AuthPage(page);
    const postPage = new PostPage(page);
    const modQueue = new ModQueuePage(page);

    // Login as regular user and report
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
    await page.locator('#report-reason').selectOption('Harassment');
    await page.locator('#report-detail').fill('Harassing content');
    await page.getByRole('button', { name: /submit report/i }).click();

    const report = state.reports.find(r => r.target === post._id);
    expect(report).toBeTruthy();

    // Logout and login as mod
    await headerLogout(page);
    await auth.goto('/login');
    await page.getByLabel('Email').fill(mod.email);
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/home/, { timeout: 10000 });

    // Go to mod queue and remove the post
    await modQueue.goto();
    await expect(modQueue.getHeading()).resolves.toBe('Moderation Queue');

    await modQueue.removeFirstReport();

    // Verify the post was removed
    const removedPost = state.posts.find(p => p._id === post._id);
    expect(removedPost.isRemoved).toBe(true);

    // Verify report status updated
    const removedReport = state.reports.find(r => r._id === report._id);
    expect(removedReport.status).toBe('removed');
  });
});

async function headerLogout(page) {
  await page.getByRole('button', { name: /user menu/i }).click();
  await page.getByRole('menuitem', { name: /log out/i }).click();
}
