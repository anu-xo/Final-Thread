import { test, expect } from '@playwright/test';
import { AuthPage } from './pages/AuthPage.js';
import { CommunityBrowserPage } from './pages/CommunityPage.js';

// Generate unique email per run so tests don't conflict
const uniqueEmail = () => `testuser_${Date.now()}@test.com`;

test.describe('Community flow', () => {
  test('user registers, sees community browser, joins a community', async ({ page }) => {
    const email = uniqueEmail();
    const authPage = new AuthPage(page);
    const communityBrowser = new CommunityBrowserPage(page);

    // Step 1: Register
    await authPage.goto('/register');
    await authPage.register(email, `testuser${Date.now()}`, 'Test1234!');

    // Should redirect to home or communities after register
    await expect(page).toHaveURL(/\/(communities|home|$)/);

    // Step 2: Navigate to community browser
    await communityBrowser.goto();
    await expect(page.getByRole('heading', { name: /explore communities/i })).toBeVisible();

    // Step 3: If communities exist, join one
    const communityCards = page.locator('a[href^="/community/"]');
    const count = await communityCards.count();

    if (count > 0) {
      await communityBrowser.joinFirstCommunity();
      await expect(page.getByRole('button', { name: /joined/i })).toBeVisible({ timeout: 5000 });
    } else {
      // No communities yet — verify the create link is visible
      await expect(page.getByRole('link', { name: /create community/i })).toBeVisible();
    }
  });
});