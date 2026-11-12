// Project rule: no gradients anywhere (CSS, SVG, canvas). Depth and glow come from blur and glass only.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const roots = [
  'packages/core/src',
  'packages/react/src',
  'apps/demo/app',
  'apps/demo/lib',
  'apps/demo/public',
];
const skip = new Set(['node_modules', '.next', 'dist']);
const pattern =
  /(linear|radial|conic)-gradient\s*\(|<(linear|radial)Gradient\b|create(Linear|Radial|Conic)Gradient\s*\(/i;

const offenders = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(css|tsx?|svg|mjs|js|html)$/.test(name)) {
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach(
          (line, i) =>
            pattern.test(line) &&
            offenders.push(`${relative(root, path)}:${i + 1}: ${line.trim()}`),
        );
    }
  }
};
for (const dir of roots) {
  try {
    walk(join(root, dir));
  } catch {
    /* directory may not exist yet */
  }
}
if (offenders.length) {
  console.error(`Gradients are not allowed (use blur/glass instead):\n${offenders.join('\n')}`);
  process.exit(1);
}
console.log('check:no-gradients — ok');
