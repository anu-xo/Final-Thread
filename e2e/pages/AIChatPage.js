export class AIChatPage {
  constructor(page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/ai/chat');
    await this.page.waitForLoadState('networkidle');
  }

  async selectCommunity(name) {
    const select = this.page.locator('select').first();
    await select.selectOption({ label: name });
  }

  async sendMessage(text) {
    const input = this.page.getByPlaceholder('Ask AI anything...');
    await input.fill(text);
    await this.page.getByRole('button', { name: /send/i }).click();
  }

  async waitForResponse(timeout = 10000) {
    const assistantMsg = this.page.locator('.bg-gray-100, .dark\\:bg-neutral-700').first();
    await assistantMsg.waitFor({ state: 'visible', timeout });
    return assistantMsg.textContent();
  }

  async getMessages() {
    return this.page.locator('.rounded-lg.px-4.py-2.5').allTextContents();
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
