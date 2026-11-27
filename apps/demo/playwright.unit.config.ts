import { defineConfig } from '@playwright/test';

/**
 * Unit tests of `lib/`: plain Playwright tests that need no browser and no server, so this config
 * has no `webServer`. `pnpm --filter demo test` runs them; the full e2e config runs them too.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /(^|[\\/])unit(-[\w-]+)?\.spec\.ts$/,
  workers: 1,
  reporter: [['list']],
  outputDir: './test-results/unit',
});
