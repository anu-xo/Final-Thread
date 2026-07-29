import { expect } from '@playwright/test';

export class CommentPage {
  constructor(page) {
    this.page = page;
    this.editor = page.locator('.ProseMirror, [role="textbox"]').first();
    this.submitBtn = page.getByRole('button', { name: /^comment$/i }).first();
  }

  async writeComment(text) {
    await this.editor.click();
    await this.editor.fill(text);
  }

  async submitComment() {
    await this.submitBtn.click();
  }

  async addComment(text) {
    await this.writeComment(text);
    await this.submitComment();
  }

  async getCommentElements() {
    return this.page.locator('[data-testid="comment"], .comment-thread > div').all();
  }

  async getCommentCount() {
    const heading = this.page.locator('h2:has-text("Comment")');
    const text = await heading.textContent({ timeout: 5000 }).catch(() => '0');
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  async getLastCommentText() {
    const comments = this.page.locator('.comment-body, .whitespace-pre-wrap, .prose');
    const count = await comments.count();
    if (count === 0) return null;
    return comments.last().textContent();
  }

  async replyToComment(commentLocator, text) {
    const replyBtn = commentLocator.locator('button:has-text("Reply")');
    await replyBtn.click();
    const replyEditor = commentLocator.locator('.ProseMirror, [role="textbox"]');
    await replyEditor.fill(text);
    await replyEditor.press('Enter');
  }

  async expectCommentVisible(text) {
    await expect(this.page.locator(`text="${text}"`).first()).toBeVisible({ timeout: 10000 });
  }
}
