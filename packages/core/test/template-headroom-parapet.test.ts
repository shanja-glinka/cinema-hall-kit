import { describe, expect, it } from 'vitest';
import { buildHallLayout } from '../src/layout.js';
import { DEFAULT_CONSTRAINTS } from '../src/schema.js';
import { templates } from '../src/templates.js';
import { validateHall } from '../src/validation.js';

const errors = (config: Parameters<typeof validateHall>[0]) =>
  validateHall(config).filter((issue) => issue.severity === 'error');

describe('parameterized templates keep the back row under the ceiling', () => {
  it.each([1, 10, 13, 20, 30])('single({ rows: %i }) has no errors', (rows) => {
    expect(errors(templates.single({ rows }))).toEqual([]);
  });

  it.each([
    [2, 2],
    [6, 5],
    [12, 10],
    [20, 15],
  ])('stadium({ frontRows: %i, rearRows: %i }) has no errors', (frontRows, rearRows) => {
    expect(errors(templates.stadium({ frontRows, rearRows }))).toEqual([]);
  });

  it.each([3, 7, 20, 30])('threeSections({ rows: %i }) has no errors', (rows) => {
    expect(errors(templates.threeSections({ rows }))).toEqual([]);
  });

  it('keeps the default hall heights', () => {
    expect(templates.single().hall.height).toBe(5);
    expect(templates.stadium().hall.height).toBe(6);
    expect(templates.threeSections().hall.height).toBe(8);
  });
});

describe('view.sightline over the full depth of the balcony front wall', () => {
  const balconyIssues = (balconyParapetHeight: number) =>
    validateHall(templates.balcony(), { constraints: { balconyParapetHeight } }).filter(
      (issue) => issue.code === 'view.sightline' && issue.ref?.bandId === 'balcony',
    );

  it('flags the first balcony row when the screen-side face of the wall hides the screen bottom', () => {
    // At 0.94 m the top of the wall at the band's front edge is just below the sightline, but the
    // wall reaches 12 cm further toward the screen, where the sightline is lower.
    expect(balconyIssues(0.94)).toEqual([
      expect.objectContaining({ params: expect.objectContaining({ row: 1 }) }),
    ]);
  });

  it('keeps the default wall clear', () => {
    expect(balconyIssues(DEFAULT_CONSTRAINTS.balconyParapetHeight)).toEqual([]);
  });

  it('exports the wall depth the 3D view draws', async () => {
    const core = await import('../src/index.js');
    expect(core.BALCONY_PARAPET_THICKNESS).toBe(0.12);
    expect(buildHallLayout(templates.balcony()).bands.some((band) => band.level >= 1)).toBe(true);
  });
});
