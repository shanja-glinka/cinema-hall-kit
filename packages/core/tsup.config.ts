import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // The library: platform neutral, no node: imports (it also runs in browsers).
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: { entry: { index: 'src/index.ts' } },
    target: 'es2022',
    platform: 'neutral',
    clean: true,
    sourcemap: true,
    treeshake: true,
  },
  {
    // The CLI runs on Node (bin `cinema-hall`).
    entry: { cli: 'src/cli/main.ts' },
    format: ['esm'],
    target: 'node22',
    platform: 'node',
    clean: false,
    sourcemap: true,
    treeshake: true,
  },
]);
