import { test, expect } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage.js';
import { CommunityBrowserPage as CommunityPage } from '../pages/CommunityPage.js';
import { PostPage } from '../pages/PostPage.js';
import { AIChatPage } from '../pages/AIChatPage.js';

test.describe('Staging: Core User Flow', () => {
  test('Login as alice → join community → create post → vote on seed post → AI chat', async ({ page }) => {
    const auth = new AuthPage(page);
    const community = new CommunityPage(page);
    const postPage = new PostPage(page);
    const aiChat = new AIChatPage(page);

    // 1. Login as pre-seeded alice
    await auth.login('alice@e2e.test', 'Password123!');
    await expect(page).toHaveURL(/\/home/, { timeout: 15000 });

    // 2. Join r/e2e-testing
    await community.joinCommunity('e2e-testing');
    await expect(page.getByRole('button', { name: /joined/i })).toBeVisible({ timeout: 10000 });

    // 3. Create a new post
    await page.goto('/submit');
    await page.waitForLoadState('domcontentloaded');
    await postPage.titleInput.fill('Staging E2E Test Post');

    const bodyEditor = page.locator('.ProseMirror, [role="textbox"]').first();
    await bodyEditor.click();
    await bodyEditor.fill('This post was created by the staging E2E test suite.');

    const communityInput = page.getByPlaceholder('Search communities...');
    await communityInput.click();
    await communityInput.fill('E2E');
    await page.getByText('r/E2E Testing').first().waitFor({ state: 'visible', timeout: 5000 });
    await page.getByText('r/E2E Testing').first().click();

    await page.getByRole('button', { name: /^post$/i }).click();
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 });
    const postTitle = await page.locator('h1').first().textContent();
    expect(postTitle).toContain('Staging E2E Test Post');

    // 4. Upvote the seed post
    const seedPostTitle = 'Welcome to E2E Testing';
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Find and navigate to seed post
    const seedLink = page.locator(`a:has-text("${seedPostTitle}")`).first();
    await seedLink.waitFor({ state: 'visible', timeout: 10000 });
    const href = await seedLink.getAttribute('href');
    const seedPostId = href.split('/').pop();
    await page.goto(`/posts/${seedPostId}`);
    await page.waitForLoadState('domcontentloaded');

    await postPage.upvote(seedPostId);
    await page.waitForTimeout(2000);
    const scoreText = await postPage.getScore();
    expect(parseInt(scoreText)).toBeGreaterThanOrEqual(0);

    // 5. AI Chat
    await aiChat.goto();
    await expect(aiChat.getHeading()).toBeVisible({ timeout: 10000 });

    const communitySelect = page.locator('select').first();
    if (await communitySelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      const options = await communitySelect.locator('option').all();
      if (options.length > 0) {
        const firstValue = await options[0].getAttribute('value');
        if (firstValue && firstValue !== '') {
          await communitySelect.selectOption({ index: 0 });
        }
      }
    }

    await aiChat.sendMessage('What is this community about?');
    const response = await aiChat.waitForResponse(30000);
    expect(response).toBeTruthy();
    expect(response.length).toBeGreaterThan(10);

    await aiChat.waitForStreamingDone(20000);
  });
});
