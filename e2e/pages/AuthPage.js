export class AuthPage {
  constructor(page) {
    this.page = page;
  }

  async goto(path = '/register') {  // accept path, default to /register
    await this.page.goto(path);
  }

  async register(email, username, password) {
    await this.page.goto('/register');  // ← add this line
    await this.page.getByLabel(/email/i).fill(email);
    await this.page.getByLabel(/username/i).fill(username);
    await this.page.getByLabel(/password/i).fill(password);
    await this.page.getByRole('button', { name: /register|sign up/i }).click();
  }

  async login(email, password) {
    await this.page.goto('/login');
    await this.page.getByLabel(/email/i).fill(email);
    await this.page.getByLabel(/password/i).fill(password);
    await this.page.getByRole('button', { name: /login|sign in/i }).click();
  }
}