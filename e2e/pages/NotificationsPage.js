import { expect } from '@playwright/test';

export class NotificationsPage {
  constructor(page) {
    this.page = page;
    this.bellBtn = page.getByRole('button', { name: /notifications/i }).first();
    this.dropdown = page.locator('[role="menu"], [aria-label="Notifications"], .notifications-dropdown, .w-80');
    this.markAllReadBtn = page.getByRole('button', { name: /mark all as read/i });
    this.unreadBadge = page.locator('span.bg-red-500, .bg-red-500');
  }

  async openDropdown() {
    await this.bellBtn.click();
    await expect(this.dropdown.first()).toBeVisible({ timeout: 5000 });
  }

  async closeDropdown() {
    await this.page.keyboard.press('Escape');
  }

  async getUnreadCount() {
    if (await this.unreadBadge.isVisible({ timeout: 2000 }).catch(() => false)) {
      const text = await this.unreadBadge.textContent();
      const match = text.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    }
    return 0;
  }

  async markAllAsRead() {
    if (await this.markAllReadBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await this.markAllReadBtn.click();
    }
  }

  async getNotificationItems() {
    return this.dropdown.locator('a, [role="menuitem"], .notification-item').all();
  }

  async getNotificationTexts() {
    return this.dropdown.locator('a, [role="menuitem"], .notification-item').allTextContents();
  }

  async hasNotificationFrom(username) {
    const texts = await this.getNotificationTexts();
    return texts.some(t => t.includes(username));
  }

  async clickNotification(index = 0) {
    const items = await this.getNotificationItems();
    if (items.length > index) {
      await items[index].click();
    }
  }

  async expectNotificationVisible(username) {
    await expect(async () => {
      const texts = await this.getNotificationTexts();
      expect(texts.some(t => t.includes(username))).toBeTruthy();
    }).toPass({ timeout: 10000 });
  }
}
