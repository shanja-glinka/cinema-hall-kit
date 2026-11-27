import { describe, expect, it } from 'vitest';
import { buildHallLayout, templates, type HallConfig } from '@cinema-hall/core';
import { balconyParts } from '../../src/scene/geometry.js';

/** The balcony template with two balcony sections whose rows are spaced differently. */
function twoSpacingBalcony(): HallConfig {
  const config = templates.balcony();
  return {
    ...config,
    layout: {
      ...config.layout,
      bands: config.layout.bands.map((band) =>
        band.id === 'balcony'
          ? {
              ...band,
              sections: [
                { id: 'bl', seatsPerRow: 6, rowSpacing: 1 },
                { id: 'br', gapBefore: 1, seatsPerRow: 6, rowSpacing: 1.5 },
              ],
            }
          : band,
      ),
    },
  };
}

describe('balcony steps follow each section', () => {
  it('puts every balcony seat on a step at its own floor height', () => {
    const layout = buildHallLayout(twoSpacingBalcony());
    const band = layout.bands.find((item) => item.id === 'balcony')!;
    const steps = balconyParts(layout).filter((part) => part.kind === 'step');
    const seats = layout.seats.filter((seat) => seat.bandId === band.id);
    // The two sections really do place the same row at different depths.
    const zOf = (section: string, row: number) =>
      seats.find((seat) => seat.sectionId === section && seat.rowIndex === row)?.position.z;
    const second = layout.rows.filter((row) => row.bandId === band.id)[1]!;
    expect(zOf('bl', second.index)).not.toBeCloseTo(zOf('br', second.index)!, 3);
    for (const seat of seats) {
      const under = steps.filter(
        (step) =>
          seat.position.x >= step.minX - 1e-9 &&
          seat.position.x <= step.maxX + 1e-9 &&
          seat.position.z >= step.minZ - 1e-9 &&
          seat.position.z <= step.maxZ + 1e-9,
      );
      expect(under.length, seat.key).toBeGreaterThan(0);
      for (const step of under) expect(step.maxY, seat.key).toBeCloseTo(seat.position.y, 6);
    }
    // The steps still cover the hall's width.
    const half = layout.hall.width / 2;
    expect(Math.min(...steps.map((step) => step.minX))).toBe(-half);
    expect(Math.max(...steps.map((step) => step.maxX))).toBe(half);
  });
});
