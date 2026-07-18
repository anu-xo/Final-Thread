const { test, expect } = require('@playwright/test');

test('User A replies to User B post → User B sees bell badge', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  // Assumes seeded users userA/userB and a seeded post authored by userB
  await pageB.goto('http://localhost:5173/login');
  await pageB.fill('[name=email]', 'userB@test.com');
  await pageB.fill('[name=password]', 'Password123!');
  await pageB.click('button[type=submit]');
  await pageB.waitForURL('**/home');

  await pageA.goto('http://localhost:5173/login');
  await pageA.fill('[name=email]', 'userA@test.com');
  await pageA.fill('[name=password]', 'Password123!');
  await pageA.click('button[type=submit]');
  await pageA.waitForURL('**/home');

  await pageA.goto('http://localhost:5173/post/SEEDED_POST_ID');
  await pageA.fill('[data-testid=comment-box]', 'Great post!');
  await pageA.click('[data-testid=comment-submit]');

  // User B should see the bell badge appear without a page refresh (socket push)
  await expect(pageB.locator('[data-testid=notification-badge]')).toHaveText('1', { timeout: 5000 });

  await contextA.close();
  await contextB.close();
});