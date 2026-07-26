export class ModQueuePage {
  constructor(page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/mod/queue');
    await this.page.waitForLoadState('networkidle');
  }

  async getHeading() {
    return this.page.getByRole('heading', { name: 'Moderation Queue' }).textContent();
  }

  async getReportCount() {
    const items = this.page.locator('.rounded-xl.border');
    return items.count();
  }

  async dismissFirstReport() {
    await this.page.getByRole('button', { name: /dismiss/i }).first().click();
    await this.page.waitForTimeout(500);
  }

  async removeFirstReport() {
    await this.page.getByRole('button', { name: /remove/i }).first().click();
    await this.page.waitForTimeout(500);
  }

  async isEmpty() {
    return this.page.getByText('No pending reports').isVisible();
  }

  async getFirstReportReason() {
    return this.page.locator('.rounded-xl.border .text-sm.font-medium').first().textContent();
  }

  async getFirstReportReporter() {
    return this.page.locator('.rounded-xl.border .text-xs.text-gray-400, .rounded-xl.border .text-xs.dark\\:text-neutral-500').first().textContent();
  }
}
