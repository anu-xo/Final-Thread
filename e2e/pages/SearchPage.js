import { expect } from '@playwright/test';

export class SearchPage {
  constructor(page) {
    this.page = page;
  }

  async goto(query) {
    await this.page.goto(`/search?q=${encodeURIComponent(query)}`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async getPostResults() {
    return this.page.locator('a[href^="/posts/"], a[href^="/post/"]').all();
  }

  async getCommunityResults() {
    return this.page.locator('a[href^="/r/"], a[href^="/community/"]').all();
  }

  async getUserResults() {
    return this.page.locator('text=/u\\//').all();
  }

  async getFirstPostLink() {
    return this.page.locator('a[href^="/posts/"], a[href^="/post/"]').first();
  }

  async clickFirstPost() {
    const link = await this.getFirstPostLink();
    await link.waitFor({ state: 'visible', timeout: 5000 });
    await link.click();
  }

  async clickFirstCommunity() {
    const link = this.page.locator('a[href^="/r/"], a[href^="/community/"]').first();
    await link.waitFor({ state: 'visible', timeout: 5000 });
    await link.click();
  }

  async getResultsHeading() {
    return this.page.locator('h1:text("Search")').textContent();
  }

  async hasNoResults() {
    return this.page.getByText('No results found').isVisible({ timeout: 5000 }).catch(() => false);
  }
}
