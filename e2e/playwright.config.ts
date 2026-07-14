// =============================================================================
// Playwright E2E — Targon Nexus end-to-end tests
// =============================================================================
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: process.env.CI ? undefined : [
    {
      command: 'pnpm run --filter @arp/api start:dev',
      port: 3001,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'pnpm run --filter @arp/web dev',
      port: 3000,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ].filter(Boolean),
});
