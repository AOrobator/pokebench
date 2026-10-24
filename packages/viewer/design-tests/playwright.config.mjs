import { URL } from 'node:url';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'trainer-cards.spec.mjs',
  outputDir: '../../../runs/trainer-card-design-results',
  snapshotPathTemplate: '{testDir}/baselines/{arg}{ext}',
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:18793',
    headless: true,
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
    launchOptions: process.env.POKEBENCH_CHROMIUM ? { executablePath: process.env.POKEBENCH_CHROMIUM } : {},
  },
  webServer: {
    command: 'node design-tests/serve.mjs',
    cwd: new URL('..', import.meta.url).pathname,
    url: 'http://127.0.0.1:18793/style.css',
    reuseExistingServer: false,
  },
});
