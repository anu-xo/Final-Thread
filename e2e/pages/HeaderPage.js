import { expect } from '@playwright/test';

export class HeaderPage {
  constructor(page) {
    this.page = page;
    this.searchInput = page.getByLabel('Search ThreadVerse');
    this.notifBtn = page.getByRole('button', { name: /notifications/i }).first();
    this.userMenuBtn = page.getByRole('button', { name: /user menu/i });
    this.logoutMenuitem = page.getByRole('menuitem', { name: /log out/i });
    this.profileMenuitem = page.getByRole('menuitem', { name: /profile/i });
  }

  async search(query) {
    await this.searchInput.fill(query);
    await this.page.keyboard.press('Enter');
  }

  async openNotifications() {
    await this.notifBtn.click();
  }

  async getUnreadCount() {
    const badge = this.page.locator('span.bg-amaranth, .bg-amaranth');
    if (await badge.isVisible({ timeout: 3000 }).catch(() => false)) {
      const text = await badge.textContent();
      const match = text.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    }
    return 0;
  }

  async openUserMenu() {
    await this.userMenuBtn.waitFor({ state: 'visible', timeout: 5000 });
    await this.userMenuBtn.click();
  }

  async logout() {
    await this.openUserMenu();
    await this.logoutMenuitem.waitFor({ state: 'visible', timeout: 5000 });
    await this.logoutMenuitem.click();
    await expect(this.page.getByText(/log in/i).first()).toBeVisible({ timeout: 10000 });
  }

  async goToProfile() {
    await this.openUserMenu();
    await this.profileMenuitem.click();
  }

  getLogo() {
    return this.page.getByText('ThreadVerse');
  }
}
