import { test, expect } from '@playwright/test';
import { setupMocks, createMockState, seedDefaults, setAuthCookie } from '../helpers/mockApi.js';
import { AuthPage } from '../pages/AuthPage.js';
import { HeaderPage } from '../pages/HeaderPage.js';
import { PostPage } from '../pages/PostPage.js';
import { AIChatPage } from '../pages/AIChatPage.js';

test.describe('Core User Flow', () => {
  test('Register → join community → create post → vote → AI chat', async ({ page }) => {
    const state = createMockState();
    seedDefaults(state);
    await setupMocks(page, state);

    const auth = new AuthPage(page);
    const header = new HeaderPage(page);
    const postPage = new PostPage(page);
    const aiChat = new AIChatPage(page);

    // ── 1. Register a new user ──────────────────────────────────────────
    const email = 'newuser@e2e.test';
    const username = 'newuser';
    const password = 'Password123!';

    await auth.goto('/register');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /register/i }).click();

    // Should redirect to /home after registration
    await expect(page).toHaveURL(/\/home/, { timeout: 10000 });

    // Set auth cookie so page.goto() reloads can restore the session
    const registeredUser = state.users.find(u => u.email === email);
    await setAuthCookie(page, registeredUser);

    // Verify the header shows the new user
    await expect(header.getLogo()).toBeVisible();
    await expect(page.getByRole('button', { name: /user menu/i })).toBeVisible();

    // ── 2. Join a community ─────────────────────────────────────────────
    await page.goto('/r/e2e-testing');
    await page.waitForLoadState('networkidle');

    const joinBtn = page.getByRole('button', { name: /^join$/i });
    if (await joinBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await joinBtn.click();
      await expect(page.getByRole('button', { name: /joined/i })).toBeVisible({ timeout: 5000 });
    }

    // ── 3. Create a post ───────────────────────────────────────────────
    await page.goto('/submit');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Title').fill('My E2E Test Post');

    // Select community via picker
    const communityInput = page.getByPlaceholder('Search communities...');
    await communityInput.click();
    await communityInput.fill('E2E');
    await page.getByText('r/E2E Testing').click({ timeout: 5000 });

    // Submit the post
    await page.getByRole('button', { name: /^post$/i }).click();

    // Verify the post was created by checking it appears in mock state
    const createdPost = state.posts.find(p => p.title === 'My E2E Test Post');
    expect(createdPost).toBeTruthy();
    expect(createdPost.author.username).toBe(username);

    // ── 4. Vote on a post ──────────────────────────────────────────────
    await postPage.goto(state.posts[0]._id);
    await postPage.upvote(state.posts[0]._id);

    // Verify vote was registered
    const votedPost = state.posts.find(p => p._id === state.posts[0]._id);
    expect(votedPost.upvotes).toBeGreaterThanOrEqual(1);

    // ── 5. AI Chat ─────────────────────────────────────────────────────
    await aiChat.goto();
    await expect(aiChat.getHeading()).toBeVisible();

    // Select community if needed
    const communitySelect = page.locator('select').first();
    if (await communitySelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await communitySelect.selectOption({ index: 0 });
    }

    await aiChat.sendMessage('What is this community about?');

    // Wait for assistant response
    const response = await aiChat.waitForResponse(15000);
    expect(response).toBeTruthy();
    expect(response.length).toBeGreaterThan(10);

    // Verify streaming completed (no cursor indicator left)
    await expect(page.locator('.animate-pulse')).toHaveCount(0, { timeout: 10000 });
  });
});
