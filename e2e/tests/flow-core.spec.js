import { test, expect } from '@playwright/test';
import { setupMocks, createMockState, seedDefaults, setAuthCookie } from '../helpers/mockApi.js';
import { AuthPage } from '../pages/AuthPage.js';
import { CommunityBrowserPage as CommunityPage } from '../pages/CommunityPage.js';
import { HeaderPage } from '../pages/HeaderPage.js';
import { PostPage } from '../pages/PostPage.js';
import { AIChatPage } from '../pages/AIChatPage.js';

async function restoreCommunitySub(page, community) {
  await page.evaluate((c) => {
    const store = window.__communityStore;
    if (store) store.getState().addSubscription(c);
  }, community);
}

test.describe('Core User Flow', () => {
  test('Register → verify email (stub) → join community → create post → vote → AI chat', async ({ page }) => {
    const state = createMockState();
    seedDefaults(state);
    await setupMocks(page, state);

    const auth = new AuthPage(page);
    const community = new CommunityPage(page);
    const postPage = new PostPage(page);
    const aiChat = new AIChatPage(page);

    const email = 'newuser@e2e.test';
    const username = 'newuser';
    const password = 'Password123!';

    await auth.register(email, username, password);

    const registeredUser = state.users.find(u => u.email === email);
    expect(registeredUser).toBeTruthy();
    await setAuthCookie(page, registeredUser);

    await auth.verifyEmail('e2e-stub-token');
    expect(registeredUser.emailVerified).toBe(true);

    await community.joinCommunity('e2e-testing');

    const testCommunity = state.communities.find(c => c.slug === 'e2e-testing');
    expect(testCommunity).toBeTruthy();

    await page.goto('/submit');
    await page.waitForLoadState('domcontentloaded');
    await restoreCommunitySub(page, testCommunity);

    await postPage.titleInput.fill('My E2E Test Post');

    const bodyEditor = page.locator('.ProseMirror, [role="textbox"]').first();
    await bodyEditor.click();
    await bodyEditor.fill('This is the body of my e2e test post.');

    const communityInput = page.getByPlaceholder('Search communities...');
    await communityInput.click();
    await communityInput.fill('E2E');
    await page.getByText('E2E Testing').first().waitFor({ state: 'visible', timeout: 5000 });
    await page.getByText('E2E Testing').first().click();

    await page.getByRole('button', { name: /^post$/i }).click();

    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 });

    const createdPost = state.posts.find(p => p.title === 'My E2E Test Post');
    expect(createdPost).toBeTruthy();
    expect(createdPost.author.username).toBe(username);

    const seedPost = state.posts.find(p => p.title === 'Welcome to E2E Testing');
    expect(seedPost).toBeTruthy();

    await postPage.goto(seedPost._id);
    await postPage.waitForPostLoaded();
    await postPage.upvote(seedPost._id);

    const votedPost = state.posts.find(p => p._id === seedPost._id);
    expect(votedPost.upvotes).toBeGreaterThanOrEqual(1);

    await aiChat.goto();
    await expect(aiChat.getHeading()).toBeVisible({ timeout: 10000 });
    await restoreCommunitySub(page, testCommunity);

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
    const response = await aiChat.waitForResponse(20000);
    expect(response).toBeTruthy();
    expect(response.length).toBeGreaterThan(10);

    await aiChat.waitForStreamingDone(15000);
  });
});
