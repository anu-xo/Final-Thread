# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-and-join.spec.js >> Community flow >> user registers, sees community browser, joins a community
- Location: e2e\auth-and-join.spec.js:9:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByLabel(/email/i)

```

# Test source

```ts
  1  | export class AuthPage {
  2  |   constructor(page) {
  3  |     this.page = page;
  4  |   }
  5  | 
  6  |   async goto(path = '/register') {  // accept path, default to /register
  7  |     await this.page.goto(path);
  8  |   }
  9  | 
  10 |   async register(email, username, password) {
  11 |     await this.page.goto('/register');  // ← add this line
> 12 |     await this.page.getByLabel(/email/i).fill(email);
     |                                          ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  13 |     await this.page.getByLabel(/username/i).fill(username);
  14 |     await this.page.getByLabel(/password/i).fill(password);
  15 |     await this.page.getByRole('button', { name: /register|sign up/i }).click();
  16 |   }
  17 | 
  18 |   async login(email, password) {
  19 |     await this.page.goto('/login');
  20 |     await this.page.getByLabel(/email/i).fill(email);
  21 |     await this.page.getByLabel(/password/i).fill(password);
  22 |     await this.page.getByRole('button', { name: /login|sign in/i }).click();
  23 |   }
  24 | }
```