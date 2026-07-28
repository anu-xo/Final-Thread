export class PostPage {
  constructor(page) {
    this.page = page;
  }

  async goto(postId) {
    await this.page.goto(`/posts/${postId}`);
    await this.page.waitForLoadState('networkidle');
  }

  async upvote(postId) {
    await this.page.locator(`#vote-up-${postId}`).click();
  }

  async downvote(postId) {
    await this.page.locator(`#vote-down-${postId}`).click();
  }

  async getScore() {
    const scoreEl = this.page.locator('.vote-score-pop').first();
    return scoreEl.textContent();
  }

  async writeComment(text) {
    const editor = this.page.locator('.tiptap, .ProseMirror, [role="textbox"]').first();
    await editor.click();
    await editor.fill(text);
  }

  async submitComment() {
    await this.page.getByRole('button', { name: /comment/i }).first().click();
  }

  async addComment(text) {
    await this.writeComment(text);
    await this.submitComment();
  }

  async reportPost(reason = 'Spam') {
    const reportBtn = this.page.getByRole('button', { name: /report/i });
    await reportBtn.click();

    const dialog = this.page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 5000 });

    const select = this.page.locator('#report-reason');
    await select.selectOption(reason);

    await this.page.getByRole('button', { name: /submit report/i }).click();
  }

  async getTitle() {
    return this.page.locator('h1').textContent();
  }

  async getCommentCount() {
    return this.page.locator('text=/\\d+ comments?/').first().textContent();
  }

  async isPostVisible(postId) {
    return this.page.locator(`a[href*="${postId}"]`).isVisible({ timeout: 3000 }).catch(() => false);
  }
}
