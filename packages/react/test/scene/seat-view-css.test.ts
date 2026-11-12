import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The directory comes from a variable: a literal `new URL('x.css', import.meta.url)` is an asset import for Vite.
const folder = '../../src/seat-view/';
const directory = new URL(folder, import.meta.url);
const css = readFileSync(new URL('seat-view.css', directory), 'utf8');

describe('seat view stylesheet', () => {
  it('wraps the canvas selector in :where() as a whole', () => {
    expect(css).toContain(':where(.chk-view canvas)');
    expect(css).not.toMatch(/:where\(\.chk-view\)\s+canvas/);
  });

  it('wraps every rule selector in :where()', () => {
    const rules = css
      .split('\n')
      .filter((line) => line.includes('{') && !line.trim().startsWith('@'));
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(rule).toMatch(/^\s*:where\(/);
  });
});
