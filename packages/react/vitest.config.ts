import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests run against the core sources so both packages can be developed together.
  resolve: {
    alias: { '@cinema-hall/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
  },
});
