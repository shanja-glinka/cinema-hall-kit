import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const picker = readFileSync('src/seat-picker/seat-picker.css', 'utf8');
const map = readFileSync('src/seat-map/seat-map.css', 'utf8');
function filterFor(selector: string) {
  const index = map.indexOf(selector);
  expect(index).toBeGreaterThan(-1);
  return map.slice(index, map.indexOf('}', index));
}
describe('blur and containment CSS contracts (F23, F39, F40, A7)', () => {
  it('suppresses screen and seat glow filters in low quality and during transitions', () => {
    for (const state of ["data-chk-quality='low'", 'data-chk-transitioning']) {
      for (const part of ['screen-glow', 'seat'])
        expect(filterFor(`:where([${state}] [data-chk='${part}']`)).toContain('filter: none');
    }
    // The screen arc uses the duplicate glow; it adds no separate drop-shadow layer.
    const arc = map.slice(
      map.indexOf(":where([data-chk='screen'] path)"),
      map.indexOf(":where([data-chk='screen'] text)"),
    );
    expect(arc).not.toContain('filter:');
    expect(picker).toContain(':where([data-chk-transitioning] .chk-glass)');
    expect(picker).toContain('backdrop-filter: none');
  });
  it('contains the fixed sheet through its root without important or specific sheet selectors', () => {
    expect(picker).toContain('contain: layout paint');
    expect(picker).not.toContain('!important');
    expect(picker).not.toContain('.react-modal-sheet-root');
    const selectors = picker
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line.endsWith('{') && !line.startsWith('@'));
    expect(selectors.every((line) => line.startsWith(':where('))).toBe(true);
  });
});

describe('floating control contrast (R3)', () => {
  it('keeps default light and dark controls above 4.5:1 against the brightest screen frame', () => {
    const tint = picker.match(/background: color-mix\(in oklab, var\(--chk-bg\) (\d+)%/);
    expect(tint).not.toBeNull();
    const alpha = Number(tint![1]) / 100;
    const base = readFileSync('src/theme/base.css', 'utf8');
    const seeds = base.match(/--chk-(?:bg|fg): #[0-9a-f]+/g) ?? [];
    const rgb = (hex: string) =>
      [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16));
    const luminance = (channels: number[]) =>
      channels
        .map((n) => n / 255)
        .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
        .reduce((sum, n, index) => sum + n * [0.2126, 0.7152, 0.0722][index]!, 0);
    for (let index = 0; index < seeds.length; index += 2) {
      const bg = rgb(seeds[index]!.split('#')[1]!);
      const fg = rgb(seeds[index + 1]!.split('#')[1]!);
      const back = luminance(bg.map((channel) => channel * alpha + 255 * (1 - alpha)));
      const front = luminance(fg);
      expect(
        (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05),
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(picker).toContain(
      'border: 1px solid color-mix(in oklab, var(--chk-fg) 24%, transparent)',
    );
    expect(picker).toContain(":where([data-chk='view-header'] [data-chk='chip'])");
    expect(picker).toContain(":where([data-chk='view-header'] [data-chk='button'])");
  });
});

describe('blur budget and vendor prefixes (F23, F40, U2)', () => {
  const css = picker.replace(/\/\*[\s\S]*?\*\//g, '');
  it('pairs every backdrop-filter declaration with its -webkit- twin of the same value (F23)', () => {
    const declarations = [...css.matchAll(/^\s*(-webkit-)?backdrop-filter:\s*([^;]+);/gm)];
    expect(declarations.length).toBeGreaterThan(0);
    for (const plain of declarations.filter((match) => !match[1])) {
      const twin = css.slice(0, plain.index).trimEnd().split('\n').pop() ?? '';
      expect(twin.trim()).toBe(`-webkit-backdrop-filter: ${plain[2]};`);
    }
  });
  it('keeps the floating controls free of backdrop blur, so a panel, controls and scene stay within two layers (F40)', () => {
    const rules = [...css.matchAll(/:where\([^{]*view-header[^{]*\)[^{]*\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(rule[1]).not.toMatch(/blur\(/);
    expect(css).not.toMatch(/backdrop-filter:\s*blur/);
  });
  it('lays the mobile footer out as a summary line over two equal-height buttons, Continue wider (U2)', () => {
    const actions = css.slice(css.indexOf(":where([data-chk='footer-actions'])"));
    expect(actions.slice(0, actions.indexOf('}'))).toContain('grid-template-columns: 1fr 1.4fr');
    expect(css).toContain("[data-chk='footer-line']");
    expect(css).toMatch(/\[data-chk='footer'\]\)\s*\{[^}]*flex-direction: column/);
    expect(css).toContain('safe-area-inset-bottom');
  });
});

describe('selection adds no filter (F40, round 5)', () => {
  it('the only filter that blurs on the map is the screen glow, so selected seats add no layer', () => {
    const css = map.replace(/\/\*[\s\S]*?\*\//g, '');
    const lines = css.split('\n');
    const active = lines.flatMap((line, index) =>
      /^\s*filter:\s+(?!none)/.test(line)
        ? [
            lines
              .slice(0, index)
              .reverse()
              .find((previous) => previous.includes('{'))
              ?.trim(),
          ]
        : [],
    );
    expect(active).toEqual([":where([data-chk='screen-glow']) {"]);
    const selected = filterFor(":where([data-chk='seat'][data-selected] rect)");
    expect(selected).not.toMatch(/filter:|drop-shadow/);
    expect(selected).toContain('stroke:');
    expect(selected).toContain('paint-order: stroke');
  });
});
