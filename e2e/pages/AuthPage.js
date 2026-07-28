export class AuthPage {
  constructor(page) {
    this.page = page;
  }

  async goto(path = '/register') {
    await this.page.goto(path);
  }

  async register(email, username, password) {
    await this.page.goto('/register');
    await this.page.getByLabel('Username').fill(username);
    await this.page.getByLabel('Email').fill(email);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: /register/i }).click();
  }

  async login(email, password) {
    await this.page.goto('/login');
    await this.page.getByLabel('Email').fill(email);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: /log in/i }).click();
  }
}
