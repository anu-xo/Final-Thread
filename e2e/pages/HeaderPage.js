export class HeaderPage {
  constructor(page) {
    this.page = page;
  }

  async search(query) {
    const input = this.page.getByLabel('Search ThreadVerse');
    await input.fill(query);
    await input.press('Enter');
  }

  async openNotifications() {
    await this.page.getByRole('button', { name: /notifications/i }).click();
  }

  async getUnreadCount() {
    const badge = this.page.locator('span.bg-red-500');
    if (await badge.isVisible({ timeout: 2000 }).catch(() => false)) {
      return parseInt(await badge.textContent(), 10);
    }
    return 0;
  }

  async openUserMenu() {
    await this.page.getByRole('button', { name: /user menu/i }).click();
  }

  async logout() {
    await this.openUserMenu();
    await this.page.getByRole('menuitem', { name: /log out/i }).click();
  }

  async goToProfile() {
    await this.openUserMenu();
    await this.page.getByRole('menuitem', { name: /profile/i }).click();
  }

  getLogo() {
    return this.page.getByText('ThreadVerse');
  }
}
