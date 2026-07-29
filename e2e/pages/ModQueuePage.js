import { expect } from '@playwright/test';

export class ModQueuePage {
  constructor(page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Moderation Queue' });
    this.dismissBtn = page.getByRole('button', { name: /^dismiss$/i }).first();
    this.removeBtn = page.getByRole('button', { name: /^remove$/i }).first();
  }

  async goto() {
    await this.page.goto('/mod/queue');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async waitForLoaded() {
    await expect(this.heading).toBeVisible({ timeout: 10000 });
  }

  async getHeading() {
    return this.heading.textContent();
  }

  async getReportCount() {
    const items = this.page.locator('.rounded-xl.border').first();
    if (await items.isVisible({ timeout: 3000 }).catch(() => false)) {
      return this.page.locator('.rounded-xl.border').count();
    }
    return 0;
  }

  async dismissFirstReport() {
    await this.dismissBtn.waitFor({ state: 'visible', timeout: 5000 });
    await this.dismissBtn.click();
    await expect(this.dismissBtn).not.toBeVisible({ timeout: 5000 }).catch(() => {});
  }

  async removeFirstReport() {
    await this.removeBtn.waitFor({ state: 'visible', timeout: 5000 });
    await this.removeBtn.click();
  }

  async isEmpty() {
    return this.page.getByText('No pending reports').isVisible({ timeout: 5000 }).catch(() => false);
  }

  async getFirstReportReason() {
    return this.page.locator('.rounded-xl.border .text-sm.font-medium').first().textContent({ timeout: 5000 });
  }

  async getFirstReportReporter() {
    return this.page.locator('.rounded-xl.border .text-xs').first().textContent({ timeout: 5000 });
  }
}
