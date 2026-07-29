import { expect } from '@playwright/test';

export class AuthPage {
  constructor(page) {
    this.page = page;
    this.usernameInput = page.locator('#username');
    this.emailInput = page.locator('#email');
    this.passwordInput = page.locator('#password');
    this.registerBtn = page.getByRole('button', { name: /^register$/i });
    this.loginBtn = page.getByRole('button', { name: /^log in$/i });
  }

  async goto(path = '/register') {
    await this.page.goto(path);
  }

  async register(email, username, password) {
    await this.goto('/register');
    await this.usernameInput.fill(username);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.registerBtn.click();
    await expect(this.page).toHaveURL(/\/home/, { timeout: 15000 });
  }

  async login(email, password) {
    await this.goto('/login');
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginBtn.click();
    await expect(this.page).toHaveURL(/\/home/, { timeout: 15000 });
  }

  async verifyEmail(token = 'e2e-stub-token') {
    await this.page.goto(`/verify-email?token=${token}`);
    await expect(this.page.getByText('Email verified!')).toBeVisible({ timeout: 10000 });
  }

  async isLoggedIn() {
    const path = this.page.url();
    return !path.includes('/login') && !path.includes('/register');
  }
}
