import { describe, expect, it } from 'vitest';
import { balconySlabSteps, buildHallLayout, templates } from '@cinema-hall/core';
import { balconyParts, balconyDimensions, buildBalconies } from '../../src/scene/geometry.js';
import { Box3 } from 'three';

const config = templates.balcony();

const layout = buildHallLayout(config);

const balcony = layout.bands.find((band) => band.id === 'balcony')!;

describe('the 3D balcony slab is the one the checks measure', () => {
  it('draws exactly the slab steps of core balconySlabSteps', () => {
    const layout = buildHallLayout(templates.balcony());
    const slab = balconyDimensions(layout).slabThickness;
    const drawn = balconyParts(layout).filter((part) => part.kind === 'step');
    const steps = balconySlabSteps(layout);
    expect(steps.length).toBeGreaterThan(0);
    expect(drawn).toHaveLength(steps.length);
    drawn.forEach((part, i) => {
      const step = steps[i]!;
      expect(part.bandId).toBe(step.bandId);
      expect(part.minX).toBeCloseTo(step.minX, 9);
      expect(part.maxX).toBeCloseTo(step.maxX, 9);
      expect(part.minZ).toBeCloseTo(step.minZ, 9);
      expect(part.maxZ).toBeCloseTo(step.maxZ, 9);
      expect(part.maxY).toBeCloseTo(step.floor, 9);
      expect(part.maxY - part.minY).toBeCloseTo(slab, 9);
    });
  });

  it('adds a riser only between rising steps of the same strip', () => {
    const layout = buildHallLayout(templates.balcony());
    const parts = balconyParts(layout);
    const steps = parts.filter((part) => part.kind === 'step');
    for (const riser of parts.filter((part) => part.kind === 'riser')) {
      const z = (riser.minZ + riser.maxZ) / 2;
      const front = steps.find(
        (step) =>
          step.minX === riser.minX && step.maxX === riser.maxX && Math.abs(step.maxZ - z) < 1e-9,
      );
      const back = steps.find(
        (step) =>
          step.minX === riser.minX && step.maxX === riser.maxX && Math.abs(step.minZ - z) < 1e-9,
      );
      expect(front).toBeDefined();
      expect(back).toBeDefined();
      expect(back!.maxY).toBeGreaterThan(front!.maxY);
      expect(riser.maxY).toBeCloseTo(back!.maxY, 9);
    }
  });

  it('keeps the step of a balcony row whose seats are all excluded', () => {
    const config = templates.balcony();
    const band = config.layout.bands.find((item) => item.id === 'balcony')!;
    const full = balconyParts(buildHallLayout(config)).filter((part) => part.kind === 'step');
    for (const section of band.sections) {
      section.exclude = Array.from({ length: section.seatsPerRow }, (_, i) => `r1.s${i + 1}`);
    }
    const layout = buildHallLayout(config);
    const drawn = balconyParts(layout).filter((part) => part.kind === 'step');
    expect(drawn).toHaveLength(balconySlabSteps(layout).length);
    expect(drawn).toHaveLength(full.length);
    drawn.forEach((part, i) => {
      expect(part.minZ).toBeCloseTo(full[i]!.minZ, 9);
      expect(part.maxY).toBeCloseTo(full[i]!.maxY, 9);
    });
  });

  it('a layout without balconies has no parts', () => {
    expect(balconyParts(buildHallLayout(templates.single()))).toEqual([]);
  });
});

describe('the rendered slab is the one validation measured', () => {
  it('a thin slab is not thickened: its underside stays where the clearance check put it', () => {
    const steps = balconyParts(layout, { slabThickness: 0.01, parapetHeight: 1 }).filter(
      (part) => part.kind === 'step',
    );
    for (const step of steps) expect(step.maxY - step.minY).toBeCloseTo(0.01, 9);
  });

  it('a zero-thickness slab is a flat floor at the row floor, nothing below it but the columns', () => {
    const dims = { slabThickness: 0, parapetHeight: 1 };
    const parts = balconyParts(layout, dims);
    for (const part of parts) {
      if (part.kind === 'support') {
        expect(part.maxY).toBeCloseTo(balcony.floorElevation, 9);
      } else {
        expect(part.minY).toBeGreaterThanOrEqual(balcony.floorElevation - 1e-9);
      }
    }
    for (const step of parts.filter((part) => part.kind === 'step')) {
      expect(step.minY).toBeCloseTo(step.maxY, 9);
    }
    const { floor, walls } = buildBalconies(layout, dims);
    floor!.computeBoundingBox();
    const box = floor!.boundingBox ?? new Box3();
    // The hairline height of a flat part goes up from the floor, never below it.
    expect(box.min.y).toBeGreaterThanOrEqual(balcony.floorElevation - 1e-9);
    floor!.dispose();
    walls!.dispose();
  });

  it('uses a zero slab from the hall constraints', () => {
    const zero = buildHallLayout({
      ...config,
      constraints: { ...config.constraints, balconySlabThickness: 0 },
    });
    const band = zero.bands.find((item) => item.id === 'balcony')!;
    const step = balconyParts(zero).find((part) => part.kind === 'step')!;
    expect(step.minY).toBeCloseTo(band.floorElevation, 9);
  });
});
