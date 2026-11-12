import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { HallConfigSchema } from '../src/schema.js';
import { alphabeticLabel, buildHallLayout, parseSeatKey } from '../src/layout.js';
import { computeSeatView } from '../src/metrics.js';
import { createSeatIndex } from '../src/seat-index.js';

const yaml = readFileSync(
  fileURLToPath(new URL('./fixtures/meridian-hall-3.yaml', import.meta.url)),
  'utf8',
);
const config = HallConfigSchema.parse(parse(yaml));
const layout = buildHallLayout(config);
const index = createSeatIndex(layout);
const byLabel = (label: string) => layout.seats.find((s) => s.label === label)!;

describe('buildHallLayout — concept hall', () => {
  it('has 9 rows A–I with 14 seats each', () => {
    expect(layout.rows.map((r) => r.label).join('')).toBe('ABCDEFGHI');
    expect(layout.seats).toHaveLength(9 * 14);
  });

  it('numbers seats continuously through sections and keys them per section', () => {
    expect(byLabel('B4').key).toBe('centre.r2.s1');
    expect(byLabel('F8').key).toBe('centre.r6.s5');
    expect(byLabel('I12').key).toBe('rec-right.r2.s1');
  });

  it.each([
    ['B4', 6.7, 85, -2.1],
    ['F8', 9.9, 61, 0.3],
    ['I12', 13.5, 45, 3.7],
  ])('metrics of %s match the concept analysis', (label, dist, fov, offset) => {
    const m = computeSeatView(layout, byLabel(label).key)!;
    expect(m.distance).toBeCloseTo(dist, 1);
    expect(Math.round(m.fovDeg)).toBe(fov);
    expect(m.lateralOffset).toBeCloseTo(offset, 5);
  });

  it('classifies zones like the concept', () => {
    expect(computeSeatView(layout, byLabel('B4').key)!.zone.id).toBe('up-close');
    expect(computeSeatView(layout, byLabel('F8').key)!.zone.id).toBe('sweet-spot');
    expect(computeSeatView(layout, byLabel('I12').key)!.zone.id).toBe('full-picture');
  });

  it('raises rows by the band riser', () => {
    expect(layout.rows.map((r) => r.elevation)).toEqual([
      0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.2, 1.5,
    ]);
  });

  it('is plain data (structuredClone and JSON round-trip)', () => {
    expect(structuredClone(layout)).toEqual(layout);
    expect(JSON.parse(JSON.stringify(layout))).toEqual(layout);
  });

  it('keeps keys of other sections when one section grows', () => {
    const grown = structuredClone(config);
    grown.layout.bands[0]!.sections[0]!.seatsPerRow = 4;
    const keysOf = (l: typeof layout, section: string) =>
      l.seats.filter((s) => s.sectionId === section).map((s) => s.key);
    expect(keysOf(buildHallLayout(grown), 'centre')).toEqual(keysOf(layout, 'centre'));
    expect(buildHallLayout(grown).seats.find((s) => s.key === 'centre.r2.s1')!.label).toBe('B5');
  });

  it('excludes seats without numbering them', () => {
    const cut = structuredClone(config);
    cut.layout.bands[0]!.sections[1]!.exclude = ['r1.s1'];
    const l = buildHallLayout(cut);
    expect(l.seats.some((s) => s.key === 'centre.r1.s1')).toBe(false);
    expect(l.seats.find((s) => s.key === 'centre.r1.s2')!.label).toBe('A4');
  });

  it('numbers per section when asked', () => {
    const per = structuredClone(config);
    per.layout.seatNumbering = 'perSection';
    expect(buildHallLayout(per).seats.find((s) => s.key === 'centre.r2.s1')!.label).toBe('B1');
  });
});

describe('helpers', () => {
  it('labels rows like spreadsheets', () => {
    expect([0, 25, 26, 27, 701, 702].map(alphabeticLabel)).toEqual([
      'A',
      'Z',
      'AA',
      'AB',
      'ZZ',
      'AAA',
    ]);
  });
  it('parses seat keys', () => {
    expect(parseSeatKey('rec-left.r2.s13')).toEqual({ sectionId: 'rec-left', row: 2, seat: 13 });
    expect(parseSeatKey('B4')).toBeNull();
  });
  it('finds neighbours only inside a section', () => {
    const n = index.neighbors('centre.r2.s1');
    expect(n.left).toBeUndefined();
    expect(n.right?.key).toBe('centre.r2.s2');
  });
});
