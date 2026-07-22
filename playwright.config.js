import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'web',
      use: { browserName: 'chromium' },
    },
    {
      name: 'electron',
      testDir: './e2e/tests',
      testMatch: '**/*desktop*.spec.js',
    },
    {
      name: 'font-audit',
      testDir: './e2e/tests',
      testMatch: '**/font-rendering*.spec.js',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'pnpm --filter web dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});