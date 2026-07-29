import { expect } from '@playwright/test';

export class PostPage {
  constructor(page) {
    this.page = page;
    this.reportBtn = page.getByRole('button', { name: /^report$/i });
    this.upvoteBtn = (postId) => page.locator(`#vote-up-${postId}`);
    this.downvoteBtn = (postId) => page.locator(`#vote-down-${postId}`);
    this.editor = page.locator('.ProseMirror, [role="textbox"]').first();
    this.submitCommentBtn = page.getByRole('button', { name: /^comment$/i }).first();
    this.titleInput = page.getByPlaceholder('Title');
  }

  async goto(postId) {
    await this.page.goto(`/posts/${postId}`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async waitForPostLoaded() {
    await expect(this.page.locator('h1').first()).toBeVisible({ timeout: 15000 });
  }

  async upvote(postId) {
    const btn = this.upvoteBtn(postId);
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    await btn.click();
  }

  async downvote(postId) {
    const btn = this.downvoteBtn(postId);
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    await btn.click();
  }

  async getScore() {
    const scoreEl = this.page.locator('.vote-score-pop').first();
    await scoreEl.waitFor({ state: 'visible', timeout: 5000 });
    return scoreEl.textContent();
  }

  async writeComment(text) {
    await this.editor.waitFor({ state: 'visible', timeout: 5000 });
    await this.editor.click();
    await this.editor.fill(text);
  }

  async submitComment() {
    await this.submitCommentBtn.click();
  }

  async addComment(text) {
    await this.writeComment(text);
    await this.submitComment();
  }

  async reportPost(reason = 'Spam', detail = '') {
    await this.reportBtn.waitFor({ state: 'visible', timeout: 5000 });
    await this.reportBtn.click();
    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await this.page.locator('#report-reason').selectOption(reason);
    if (detail) {
      await this.page.locator('#report-detail').fill(detail);
    }
    await this.page.getByRole('button', { name: /submit report/i }).click();
  }

  async getTitle() {
    return this.page.locator('h1').first().textContent();
  }

  async getCommentCount() {
    const el = this.page.locator('text=/\\d+ comments?/').first();
    const text = await el.textContent({ timeout: 5000 }).catch(() => '0 comments');
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  async isPostVisible(postId) {
    const locator = this.page.locator(`a[href*="${postId}"]`);
    try {
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async expectPostNotVisible(postId) {
    const locator = this.page.locator(`a[href*="${postId}"]`);
    await expect(locator).toHaveCount(0, { timeout: 10000 });
  }
}
