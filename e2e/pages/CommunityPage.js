import { expect } from '@playwright/test';

export class CommunityBrowserPage {
  constructor(page) {
    this.page = page;
    this.joinBtn = page.getByRole('button', { name: /^join$/i });
    this.joinedBtn = page.getByRole('button', { name: /^joined$/i });
  }

  async goto(slug) {
    await this.page.goto(slug ? `/r/${slug}` : '/communities');
  }

  async joinFirstCommunity() {
    const card = this.page.locator('a[href^="/r/"], a[href^="/community/"]').first();
    await card.click();
    await this.joinBtn.waitFor({ state: 'visible', timeout: 5000 });
    await this.joinBtn.click();
    await expect(this.joinedBtn).toBeVisible({ timeout: 5000 });
  }

  async joinCommunity(slug) {
    await this.goto(slug);
    if (await this.joinBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.joinBtn.click();
      await expect(this.joinedBtn).toBeVisible({ timeout: 5000 });
    }
  }

  async isJoined() {
    return this.joinedBtn.isVisible().catch(() => false);
  }

  async getHeadingText() {
    return this.page.locator('h1').first().textContent();
  }
}
