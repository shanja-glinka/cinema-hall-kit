import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  target: 'es2022',
  clean: true,
  sourcemap: true,
  // No rollup treeshake pass: it strips the "use client" directive. esbuild still tree-shakes ESM.
  external: [
    'react',
    'react-dom',
    'three',
    '@react-three/fiber',
    'motion',
    'react-modal-sheet',
    '@cinema-hall/core',
  ],
  // Next.js App Router: every export of this package is a Client Component / hook.
  banner: { js: '"use client";' },
});
