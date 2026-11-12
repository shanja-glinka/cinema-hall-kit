import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/cli/**'],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});
