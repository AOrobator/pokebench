import { URL } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'mobile-dates.spec.mjs',
  outputDir: '../../../runs/mobile-date-results', workers: 1, retries: 0,
  use: { baseURL: 'http://127.0.0.1:18793', headless: true },
  projects: [
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: { command: 'node design-tests/serve.mjs', cwd: new URL('..', import.meta.url).pathname, url: 'http://127.0.0.1:18793/style.css', reuseExistingServer: false },
});
