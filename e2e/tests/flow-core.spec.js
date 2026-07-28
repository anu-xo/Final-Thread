import { test, expect } from '@playwright/test';
import { setupMocks, createMockState, seedDefaults, setAuthCookie } from '../helpers/mockApi.js';
import { AuthPage } from '../pages/AuthPage.js';
import { HeaderPage } from '../pages/HeaderPage.js';
import { PostPage } from '../pages/PostPage.js';
import { AIChatPage } from '../pages/AIChatPage.js';

test.describe('Core User Flow', () => {
  test('Register → verify email (stub) → join community → create post → vote → AI chat', async ({ page }) => {
    const state = createMockState();
    seedDefaults(state);
    await setupMocks(page, state);

    const auth = new AuthPage(page);
    const header = new HeaderPage(page);
    const postPage = new PostPage(page);
    const aiChat = new AIChatPage(page);

    const email = 'newuser@e2e.test';
    const username = 'newuser';
    const password = 'Password123!';

    // ── 1. Register ─────────────────────────────────────────────────────
    await auth.goto('/register');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /register/i }).click();
    await expect(page).toHaveURL(/\/home/, { timeout: 10000 });

    const registeredUser = state.users.find(u => u.email === email);
    await setAuthCookie(page, registeredUser);

    // ── 2. Verify email (stub) ──────────────────────────────────────────
    await page.goto('/verify-email?token=e2e-stub-token');
    await expect(page.getByText('Email verified!')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Your account is now fully activated.')).toBeVisible();
    expect(registeredUser.emailVerified).toBe(true);

    // ── 3. Join a community ─────────────────────────────────────────────
    await page.goto('/r/e2e-testing');
    await page.waitForLoadState('networkidle');

    const joinBtn = page.getByRole('button', { name: /^join$/i });
    if (await joinBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await joinBtn.click();
      await expect(page.getByRole('button', { name: /joined/i })).toBeVisible({ timeout: 5000 });
    }

    // ── 4. Create a post ───────────────────────────────────────────────
    await page.goto('/submit');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Title').fill('My E2E Test Post');

    const communityInput = page.getByPlaceholder('Search communities...');
    await communityInput.click();
    await communityInput.fill('E2E');
    await page.getByText('r/E2E Testing').click({ timeout: 5000 });

    await page.getByRole('button', { name: /^post$/i }).click();

    const createdPost = state.posts.find(p => p.title === 'My E2E Test Post');
    expect(createdPost).toBeTruthy();
    expect(createdPost.author.username).toBe(username);

    // ── 5. Vote on a post ──────────────────────────────────────────────
    await postPage.goto(state.posts[0]._id);
    await postPage.upvote(state.posts[0]._id);

    const votedPost = state.posts.find(p => p._id === state.posts[0]._id);
    expect(votedPost.upvotes).toBeGreaterThanOrEqual(1);

    // ── 6. AI Chat ─────────────────────────────────────────────────────
    await aiChat.goto();
    await expect(aiChat.getHeading()).toBeVisible();

    const communitySelect = page.locator('select').first();
    if (await communitySelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await communitySelect.selectOption({ index: 0 });
    }

    await aiChat.sendMessage('What is this community about?');
    const response = await aiChat.waitForResponse(15000);
    expect(response).toBeTruthy();
    expect(response.length).toBeGreaterThan(10);

    await expect(page.locator('.animate-pulse')).toHaveCount(0, { timeout: 10000 });
  });
});
