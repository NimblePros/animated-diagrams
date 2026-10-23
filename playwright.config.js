// Browser tests for the renderer, animator, player and hosts. `npm run test:browser`
// starts Vite (test/browser/vite.config.js) to serve the repo and the fixtures.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'test/browser',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5179/test/browser/fixtures/',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npx vite --config test/browser/vite.config.js',
    url: 'http://localhost:5179/test/browser/fixtures/harness.html',
    reuseExistingServer: !process.env.CI,
  },
});
