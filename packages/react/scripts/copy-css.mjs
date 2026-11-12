// Builds `dist/styles.css` (shipped as `@cinema-hall/react/styles.css`) from the per-area
// stylesheets, in cascade order. Each area owns its own file; base.css declares the layers.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parts = [
  'theme/base.css',
  'seat-map/seat-map.css',
  'seat-view/seat-view.css',
  'sheet/sheet.css',
  'seat-picker/seat-picker.css',
  'constructor/constructor.css',
];

const css = parts
  .map((p) => resolve(root, 'src', p))
  .filter((file) => existsSync(file))
  .map((file) => readFileSync(file, 'utf8').trim())
  .join('\n\n');

mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/styles.css'), `${css}\n`);
