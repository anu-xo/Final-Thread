import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/staging',
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'staging-core',
      testMatch: '**/staging-core.spec.js',
      use: { browserName: 'chromium' },
    },
    {
      name: 'staging-moderation',
      testMatch: '**/staging-moderation.spec.js',
      use: { browserName: 'chromium' },
    },
    {
      name: 'staging-social',
      testMatch: '**/staging-social.spec.js',
      use: { browserName: 'chromium' },
    },
    {
      name: 'staging-debug',
      testMatch: '**/staging-debug.spec.js',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
