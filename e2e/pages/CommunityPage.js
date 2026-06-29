export class CommunityBrowserPage {
  constructor(page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/communities');
  }

  async joinFirstCommunity() {
    // Click first community card
    const card = this.page.locator('a[href^="/community/"]').first();
    await card.click();
    
    // Click join button
    await this.page.getByRole('button', { name: /^join$/i }).click();
  }

  async isJoined() {
    return this.page.getByRole('button', { name: /joined/i }).isVisible();
  }
}