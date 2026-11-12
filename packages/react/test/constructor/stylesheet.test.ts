import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Relative to the package directory, where vitest runs (as in support.ts).
const css = readFileSync('src/constructor/constructor.css', 'utf8');

/** The `@layer <name> { … }` blocks of a sheet, with the offsets of their opening and closing braces. */
function layerBlocks(source: string): { name: string; start: number; end: number }[] {
  const blocks: { name: string; start: number; end: number }[] = [];
  for (const match of source.matchAll(/@layer\s+([\w.-]+)\s*\{/g)) {
    const start = match.index ?? 0;
    let depth = 0;
    let end = source.length;
    for (let at = start + match[0].length - 1; at < source.length; at += 1) {
      if (source[at] === '{') depth += 1;
      else if (source[at] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = at;
          break;
        }
      }
    }
    blocks.push({ name: match[1] ?? '', start, end });
  }
  return blocks;
}

const blocks = layerBlocks(css);

describe('F24: every constructor rule lives in a chk layer', () => {
  it('the drag handle rule is inside chk.structure', () => {
    const at = css.indexOf(":where([data-chk='editor-drag'])");
    expect(at).toBeGreaterThan(-1);
    const block = blocks.find((item) => at > item.start && at < item.end);
    expect(block?.name).toBe('chk.structure');
  });

  it('no rule sits outside a chk layer', () => {
    expect(blocks.length).toBeGreaterThan(0);
    expect(
      blocks.every((block) => block.name === 'chk.structure' || block.name === 'chk.skin'),
    ).toBe(true);
    let outside = '';
    let cursor = 0;
    for (const block of blocks) {
      outside += css.slice(cursor, block.start);
      cursor = block.end + 1;
    }
    outside += css.slice(cursor);
    expect(outside.replace(/\/\*[\s\S]*?\*\//g, '').trim()).toBe('');
  });

  it('the sheet has no gradients', () => {
    expect(css).not.toMatch(/gradient\s*\(/i);
  });
});
