import { expect } from '@playwright/test';

export class AIChatPage {
  constructor(page) {
    this.page = page;
    this.communitySelect = page.locator('select').first();
    this.input = page.getByPlaceholder('Ask AI anything...');
    this.sendBtn = page.getByRole('button', { name: /^send$/i });
  }

  async goto() {
    await this.page.goto('/ai/chat');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async selectCommunity(name) {
    if (await this.communitySelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.communitySelect.selectOption({ label: name });
    }
  }

  async selectFirstCommunity() {
    if (await this.communitySelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      const options = await this.communitySelect.locator('option').all();
      if (options.length > 0) {
        await this.communitySelect.selectOption({ index: 0 });
      }
    }
  }

  async sendMessage(text) {
    await this.input.waitFor({ state: 'visible', timeout: 5000 });
    await this.input.fill(text);
    await this.sendBtn.click();
  }

  async waitForResponse(timeout = 15000) {
    const assistantMsg = this.page.locator('.bg-gray-100, .dark\\:bg-neutral-700').last();
    await assistantMsg.waitFor({ state: 'visible', timeout });
    return assistantMsg.textContent();
  }

  async waitForStreamingDone(timeout = 15000) {
    const pulse = this.page.locator('.animate-pulse');
    await expect(pulse).toHaveCount(0, { timeout });
  }

  async getMessages() {
    return this.page.locator('.rounded-lg.px-4.py-2\\.5').allTextContents();
  }

  async getLastAssistantMessage() {
    const msgs = this.page.locator('.bg-gray-100, .dark\\:bg-neutral-700');
    const count = await msgs.count();
    if (count === 0) return null;
    return msgs.last().textContent();
  }

  getHeading() {
    return this.page.getByRole('heading', { name: 'AI Chat' });
  }
}
