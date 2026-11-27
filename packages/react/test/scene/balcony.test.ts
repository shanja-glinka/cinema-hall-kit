import { describe, expect, it } from 'vitest';
import { Box3 } from 'three';
import { buildHallLayout, templates } from '@cinema-hall/core';
import {
  balconyDimensions,
  balconyParts,
  buildBalconies,
  DEFAULT_BALCONY,
  platformSpans,
} from '../../src/scene/geometry.js';

const layout = buildHallLayout(templates.balcony());
const balcony = layout.bands.find((band) => band.id === 'balcony')!;

describe('balconies in the 3D scene', () => {
  it('builds a stepped slab under each balcony row, from its front edge to the back wall', () => {
    const steps = balconyParts(layout).filter((part) => part.kind === 'step');
    const rows = layout.rows.filter((row) => row.bandId === 'balcony');
    expect(steps).toHaveLength(rows.length);
    steps.forEach((step, i) => {
      expect(step.maxY).toBeCloseTo(rows[i]!.elevation, 6);
      expect(step.maxY - step.minY).toBeCloseTo(DEFAULT_BALCONY.slabThickness, 6);
      expect(step.minX).toBe(-layout.hall.width / 2);
      expect(step.maxX).toBe(layout.hall.width / 2);
    });
    expect(steps[0]!.minZ).toBeCloseTo(balcony.minZ, 6);
    expect(steps.at(-1)!.maxZ).toBeCloseTo(layout.hall.depth, 6);
    // Consecutive steps meet, and a riser closes each step.
    for (let i = 1; i < steps.length; i++)
      expect(steps[i]!.minZ).toBeCloseTo(steps[i - 1]!.maxZ, 6);
    expect(balconyParts(layout).filter((part) => part.kind === 'riser')).toHaveLength(
      rows.length - 1,
    );
  });

  it('adds the front wall and columns down to the floor', () => {
    const parts = balconyParts(layout);
    const parapet = parts.find((part) => part.kind === 'parapet')!;
    expect(parapet.maxZ).toBeCloseTo(balcony.minZ, 6);
    expect(parapet.maxY).toBeCloseTo(balcony.floorElevation + DEFAULT_BALCONY.parapetHeight, 6);
    const supports = parts.filter((part) => part.kind === 'support');
    expect(supports).toHaveLength(2);
    for (const support of supports) {
      expect(support.minY).toBe(0);
      expect(support.maxY).toBeCloseTo(balcony.floorElevation - DEFAULT_BALCONY.slabThickness, 6);
    }
    // Custom sizes are used.
    const custom = balconyParts(layout, { slabThickness: 0.5, parapetHeight: 1 });
    expect(custom.find((part) => part.kind === 'parapet')!.maxY).toBeCloseTo(
      balcony.floorElevation + 1,
      6,
    );
  });

  it('keeps the rows under the balcony free: no platform from the hall floor up to it', () => {
    const spans = platformSpans(layout);
    expect(spans.every((span) => span.height < balcony.floorElevation)).toBe(true);
    // The recliners under the balcony still stand on their own raised floor.
    const recliners = layout.rows.filter((row) => row.bandId === 'recliners');
    expect(spans.filter((span) => span.height === recliners[0]!.elevation).length).toBeGreaterThan(
      0,
    );
    // Nothing of the balcony reaches below its underside except the columns at the side walls.
    const underside = balcony.floorElevation - DEFAULT_BALCONY.slabThickness;
    for (const part of balconyParts(layout)) {
      if (part.kind !== 'support') expect(part.minY).toBeGreaterThanOrEqual(underside - 1e-9);
    }
  });

  it('merges the balcony into two geometries', () => {
    const { floor, walls } = buildBalconies(layout);
    expect(floor).not.toBeNull();
    expect(walls).not.toBeNull();
    floor!.computeBoundingBox();
    const box = floor!.boundingBox ?? new Box3();
    expect(box.max.y).toBeCloseTo(balcony.topElevation, 6);
    expect(box.min.y).toBeCloseTo(balcony.floorElevation - DEFAULT_BALCONY.slabThickness, 6);
    floor!.dispose();
    walls!.dispose();
  });

  it('draws nothing for a hall on one level', () => {
    const flat = buildHallLayout(templates.threeSections());
    expect(balconyParts(flat)).toEqual([]);
    const { floor, walls } = buildBalconies(flat);
    expect(floor).toBeNull();
    expect(walls).toBeNull();
  });
});

describe('balcony sizes from the layout', () => {
  it('uses the slab and parapet sizes the layout resolved from the constraints', () => {
    const config = templates.balcony();
    const sized = buildHallLayout({
      ...config,
      constraints: { ...config.constraints, balconySlabThickness: 0.5, balconyParapetHeight: 1.1 },
    });
    expect(balconyDimensions(sized)).toEqual({ slabThickness: 0.5, parapetHeight: 1.1 });
    const parts = balconyParts(sized);
    const step = parts.find((part) => part.kind === 'step')!;
    expect(step.maxY - step.minY).toBeCloseTo(0.5, 6);
    const parapet = parts.find((part) => part.kind === 'parapet')!;
    const firstRow = sized.rows.find((row) => row.bandId === 'balcony')!;
    expect(parapet.maxY - firstRow.elevation).toBeCloseTo(1.1, 6);
  });

  it('falls back to the defaults when a layout has no sizes', () => {
    const bare = { ...layout } as Partial<typeof layout>;
    delete bare.balconySlabThickness;
    delete bare.balconyParapetHeight;
    expect(balconyDimensions(bare as typeof layout)).toEqual(DEFAULT_BALCONY);
  });
});
