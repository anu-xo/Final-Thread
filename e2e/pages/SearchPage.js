export class SearchPage {
  constructor(page) {
    this.page = page;
  }

  async goto(query) {
    await this.page.goto(`/search?q=${encodeURIComponent(query)}`);
    await this.page.waitForLoadState('networkidle');
  }

  async getPostResults() {
    return this.page.locator('a[href^="/posts/"], a[href^="/post/"]').all();
  }

  async getCommunityResults() {
    return this.page.locator('a[href^="/community/"]').all();
  }

  async getUserResults() {
    return this.page.locator('text=/u\\//').all();
  }

  async clickFirstPost() {
    await this.page.locator('a[href^="/posts/"], a[href^="/post/"]').first().click();
  }

  async clickFirstCommunity() {
    await this.page.locator('a[href^="/community/"]').first().click();
  }

  async getResultsHeading() {
    return this.page.locator('h1:text("Search")').textContent();
  }

  async hasNoResults() {
    return this.page.getByText('No results found').isVisible();
  }
}
