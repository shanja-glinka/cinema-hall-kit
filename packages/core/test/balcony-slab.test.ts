import { describe, expect, it } from 'vitest';
import { balconySlabSteps } from '../src/band-geometry.js';
import { buildHallLayout, type HallLayout } from '../src/layout.js';
import { computeSeatView } from '../src/metrics.js';
import { HallConfigSchema, type HallConfig } from '../src/schema.js';
import { createSeatIndex } from '../src/seat-index.js';
import { templates } from '../src/templates.js';
import { validateHall } from '../src/validation.js';
import { fixtureConfig } from './support.js';

/**
 * A one-seat balcony right above a two-seat stalls row. The stalls seats flank the balcony seat, so
 * neither stalls seat is under a balcony section, but both are under the slab the 3D view draws.
 */
function narrowBalcony(elevation: number): HallConfig {
  return HallConfigSchema.parse({
    version: 1,
    name: 'Narrow balcony',
    hall: { width: 6, depth: 8, height: 6 },
    screen: { width: 4, height: 2, elevation: 0.5 },
    seatTypes: { standard: { label: 'Classic', width: 0.5, depth: 0.5, color: '#5E636B' } },
    layout: {
      firstRowDistance: 4,
      bands: [
        {
          id: 'stalls',
          defaults: { rows: 1, rowSpacing: 1, seatPitch: 0.6, seatType: 'standard' },
          sections: [{ id: 'stalls', seatsPerRow: 2 }],
        },
        {
          id: 'balcony',
          startDistance: 4,
          elevation,
          defaults: { rows: 1, rowSpacing: 1, seatPitch: 0.5, seatType: 'standard' },
          sections: [{ id: 'balcony', seatsPerRow: 1 }],
        },
      ],
    },
  });
}

const overlap = (config: HallConfig) =>
  validateHall(config).filter((issue) => issue.code === 'layout.bandOverlap');

describe('balcony slab footprint', () => {
  it('spans the hall width and runs back to the wall', () => {
    const layout = buildHallLayout(narrowBalcony(3));
    expect(balconySlabSteps(layout)).toEqual([
      { bandId: 'balcony', level: 1, minX: -3, maxX: 3, minZ: 3.5, maxZ: 8, floor: 3 },
    ]);
  });

  it('ends where the next balcony of the same level starts and has one step per row', () => {
    const steps = balconySlabSteps(buildHallLayout(templates.balcony()));
    expect(steps.map((step) => [step.minZ, step.maxZ, step.floor])).toEqual([
      [11.4, 12.4, 4.5],
      [12.4, 13.4, 5.1],
      [13.4, 16, 5.7],
    ]);
    expect(steps.every((step) => step.minX === -9 && step.maxX === 9)).toBe(true);
  });

  it('is empty for a single-level layout and for a hand-built layout without bands', () => {
    const layout = buildHallLayout(fixtureConfig());
    expect(balconySlabSteps(layout)).toEqual([]);
    const { bands: _bands, ...handBuilt } = layout;
    expect(balconySlabSteps(handBuilt)).toEqual([]);
  });
});

describe('layout.bandOverlap over the whole balcony slab', () => {
  it('reports seats under the slab that are outside every balcony section', () => {
    const config = narrowBalcony(0.2);
    const layout = buildHallLayout(config);
    const upper = layout.sections.find((box) => box.bandId === 'balcony')!;
    const stalls = layout.seats.filter((seat) => seat.bandId === 'stalls');
    // Neither stalls seat is inside the balcony's section box ...
    expect(
      stalls.every((seat) => seat.position.x < upper.minX || seat.position.x > upper.maxX),
    ).toBe(true);
    // ... but the slab covers both of them.
    expect(overlap(config)).toEqual([
      expect.objectContaining({
        severity: 'error',
        path: ['layout', 'bands', 1, 'elevation'],
        params: { required: 2.7, available: 0.2, rowLabel: 'A', band: 'Balcony', below: 'Stalls' },
      }),
    ]);
  });

  it('accepts the balcony once its slab clears the seats under it', () => {
    expect(overlap(narrowBalcony(2.69))).toHaveLength(1);
    expect(overlap(narrowBalcony(2.7))).toEqual([]);
  });

  it('checks rows behind the balcony seats that the slab still covers', () => {
    const config = narrowBalcony(2.7);
    // A ground-floor band behind the balcony rows, under the slab that runs back to the wall.
    config.layout.bands.push({
      id: 'rear',
      startDistance: 6,
      elevation: 1,
      defaults: { rows: 1, rowSpacing: 1, seatPitch: 0.6, seatType: 'standard' },
      sections: [{ id: 'rear', seatsPerRow: 2 }],
    });
    const layout = buildHallLayout(config);
    expect(layout.bands.map((band) => [band.id, band.level])).toEqual([
      ['stalls', 0],
      ['balcony', 1],
      ['rear', 0],
    ]);
    expect(overlap(config)).toEqual([
      expect.objectContaining({
        params: expect.objectContaining({ required: 3.7, available: 2.7, below: 'Rear' }),
      }),
    ]);
  });
});

describe('view.sightline barrier', () => {
  it('adds no front barrier to a raised ground-floor band', () => {
    const config = fixtureConfig();
    config.layout.bands[1]!.elevation = 2;
    const layout = buildHallLayout(config);
    expect(layout.bands[1]!.level).toBe(0);
    const sightline = (balconyParapetHeight: number) =>
      validateHall(config, { constraints: { balconyParapetHeight } }).filter(
        (issue) => issue.code === 'view.sightline' && issue.ref?.bandId === 'recliners',
      );
    // A 3 m barrier at the front of the recliners would block their first row (H); without a
    // barrier only the heads of row H block row I.
    expect(sightline(3)).toEqual(sightline(0.8));
    expect(sightline(3).map((issue) => issue.params?.rowLabel)).toEqual(['I', 'I', 'I']);
  });

  it('still blocks the view from a balcony with a high barrier', () => {
    const issues = validateHall(templates.balcony(), {
      constraints: { balconyParapetHeight: 3 },
    }).filter((issue) => issue.code === 'view.sightline');
    expect(issues.map((issue) => issue.ref?.bandId)).toContain('balcony');
  });
});

describe('view.sightline barriers of earlier balcony bands', () => {
  /**
   * Stalls under two balcony bands of one level. The rear band's two seats are beside the single
   * seat of the front balcony band, so no head is in their column; they clear their own barrier,
   * but the barrier of the front band, lower down the sightline, hides the bottom of the screen.
   */
  function twoBalconyBands(): HallConfig {
    return HallConfigSchema.parse({
      version: 1,
      name: 'Two balcony bands',
      hall: { width: 8, depth: 14, height: 8 },
      screen: { width: 4, height: 2, elevation: 0.5, curvature: 0 },
      seatTypes: { standard: { label: 'Classic', width: 0.5, depth: 0.5, color: '#5E636B' } },
      layout: {
        firstRowDistance: 4,
        bands: [
          {
            id: 'stalls',
            riserHeight: 0,
            defaults: { rows: 6, rowSpacing: 1, seatPitch: 0.6, seatType: 'standard' },
            sections: [{ id: 'stalls', seatsPerRow: 1 }],
          },
          {
            id: 'front-balcony',
            startDistance: 6,
            elevation: 3,
            defaults: { rows: 1, rowSpacing: 1, seatPitch: 1, seatType: 'standard' },
            sections: [{ id: 'front-balcony', seatsPerRow: 1 }],
          },
          {
            id: 'rear-balcony',
            startDistance: 9,
            elevation: 4,
            defaults: { rows: 1, rowSpacing: 1, seatPitch: 1, seatType: 'standard' },
            sections: [{ id: 'rear-balcony', seatsPerRow: 3, exclude: ['r1.s2'] }],
          },
        ],
      },
    });
  }

  it('flags a rear balcony row hidden by the barrier of the band in front', () => {
    const config = twoBalconyBands();
    const layout = buildHallLayout(config);
    expect(layout.bands.map((band) => [band.id, band.level])).toEqual([
      ['stalls', 0],
      ['front-balcony', 1],
      ['rear-balcony', 1],
    ]);
    const rear = (balconyParapetHeight: number) =>
      validateHall(config, { constraints: { balconyParapetHeight } }).filter(
        (issue) => issue.code === 'view.sightline' && issue.ref?.bandId === 'rear-balcony',
      );
    // A low barrier in front clears the sightline; the default 0.8 m one blocks it.
    expect(rear(0.1)).toEqual([]);
    expect(rear(0.8)).toEqual([
      expect.objectContaining({
        path: ['layout', 'bands', 2, 'sections', 0],
        params: { row: 1, rowLabel: expect.any(String), section: 'Rear balcony' },
      }),
    ]);
  });
});

describe('hand-built layouts', () => {
  it('accept a HallLayout without the level and balcony fields', () => {
    const built = buildHallLayout(fixtureConfig());
    // The shape a consumer built by hand before levels and balconies existed.
    const legacy: HallLayout = {
      schemaVersion: 1,
      name: built.name,
      hall: built.hall,
      screen: built.screen,
      seatTypes: built.seatTypes,
      zones: built.zones,
      eyeHeight: built.eyeHeight,
      seats: built.seats.map(({ level: _level, ...seat }) => seat),
      rows: built.rows.map(({ level: _level, ...row }) => row),
      sections: built.sections.map(({ level: _l, floorElevation: _f, ...box }) => box),
      bounds: built.bounds,
    };
    const key = legacy.seats[0]!.key;
    expect(createSeatIndex(legacy).get(key)?.key).toBe(key);
    expect(computeSeatView(legacy, key)).toEqual(computeSeatView(built, key));
  });

  it('get every field filled in from buildHallLayout', () => {
    const layout = buildHallLayout(templates.balcony());
    expect(layout.balconySlabThickness).toBe(0.3);
    expect(layout.balconyParapetHeight).toBe(0.8);
    expect(layout.bands.length).toBeGreaterThan(0);
    expect(layout.seats.every((seat) => typeof seat.level === 'number')).toBe(true);
    expect(layout.rows.every((row) => typeof row.level === 'number')).toBe(true);
    expect(
      layout.sections.every(
        (box) => typeof box.level === 'number' && typeof box.floorElevation === 'number',
      ),
    ).toBe(true);
  });
});

describe('balcony sizes in the layout', () => {
  const withOwnSizes = () => {
    const config = templates.balcony();
    config.constraints = { balconySlabThickness: 3, balconyParapetHeight: 2 };
    return config;
  };

  it('takes the sizes from the config unless options override them', () => {
    const config = withOwnSizes();
    expect(buildHallLayout(config)).toMatchObject({
      balconySlabThickness: 3,
      balconyParapetHeight: 2,
    });
    expect(buildHallLayout(config, { enforce: true })).toMatchObject({
      balconySlabThickness: 0.3,
      balconyParapetHeight: 0.8,
    });
    expect(buildHallLayout(config, { constraints: { balconySlabThickness: 0.4 } })).toMatchObject({
      balconySlabThickness: 0.4,
      balconyParapetHeight: 2,
    });
    expect(
      buildHallLayout(config, { enforce: true, constraints: { balconyParapetHeight: 1 } }),
    ).toMatchObject({ balconySlabThickness: 0.3, balconyParapetHeight: 1 });
  });

  it('gives the rules a layout with the sizes they check', () => {
    const seen: { layout: number[]; constraints: number[] }[] = [];
    const probe = {
      code: 'probe',
      check(ctx: { layout: HallLayout; constraints: Record<string, number> }) {
        seen.push({
          layout: [ctx.layout.balconySlabThickness!, ctx.layout.balconyParapetHeight!],
          constraints: [
            ctx.constraints['balconySlabThickness']!,
            ctx.constraints['balconyParapetHeight']!,
          ],
        });
        return [];
      },
    };
    const config = withOwnSizes();
    validateHall(config, { enforce: true, extraRules: [probe] });
    validateHall(config, { constraints: { balconySlabThickness: 0.5 }, extraRules: [probe] });
    validateHall(config, { extraRules: [probe] });
    expect(seen).toEqual([
      { layout: [0.3, 0.8], constraints: [0.3, 0.8] },
      { layout: [0.5, 2], constraints: [0.5, 2] },
      { layout: [3, 2], constraints: [3, 2] },
    ]);
  });
});

describe('balcony slab with empty rows', () => {
  it('keeps the step of a row whose seats are all excluded', () => {
    const full = balconySlabSteps(buildHallLayout(templates.balcony()));
    const config = templates.balcony();
    const balcony = config.layout.bands.find((band) => band.id === 'balcony')!;
    balcony.sections[0]!.exclude = Array.from({ length: 14 }, (_, i) => `r1.s${i + 1}`);
    const layout = buildHallLayout(config);
    expect(layout.seats.some((seat) => seat.key.startsWith('balcony.r1.'))).toBe(false);
    expect(balconySlabSteps(layout)).toEqual(full);
  });

  it('keeps the strip of a section whose seats are all excluded', () => {
    const config = narrowBalcony(3);
    config.layout.bands[1]!.sections.push({ id: 'side', gapBefore: 1, seatsPerRow: 1 });
    const full = balconySlabSteps(buildHallLayout(config));
    config.layout.bands[1]!.sections[1]!.exclude = ['r1.s1'];
    expect(balconySlabSteps(buildHallLayout(config))).toEqual(full);
    expect(full.map((step) => [step.minX, step.maxX])).toEqual([
      [-3, 0],
      [0, 3],
    ]);
  });
});

describe('view.overhang over the whole balcony slab', () => {
  const overhang = (config: HallConfig) =>
    validateHall(config).filter((issue) => issue.code === 'view.overhang');

  it('warns seats beside the balcony seats that the slab hides the screen from', () => {
    const config = narrowBalcony(1.5);
    const layout = buildHallLayout(config);
    const upper = layout.sections.find((box) => box.bandId === 'balcony')!;
    const stalls = layout.seats.filter((seat) => seat.bandId === 'stalls');
    expect(stalls.every((seat) => seat.eye.x < upper.minX || seat.eye.x > upper.maxX)).toBe(true);
    expect(overhang(config)).toEqual([
      expect.objectContaining({
        severity: 'warning',
        params: expect.objectContaining({ rowLabel: 'A', section: 'Stalls', band: 'Balcony' }),
      }),
    ]);
  });

  it('warns seats behind the balcony seats that the slab still covers', () => {
    const config = narrowBalcony(2.7);
    config.layout.bands.push({
      id: 'rear',
      startDistance: 6,
      elevation: 1.3,
      defaults: { rows: 1, rowSpacing: 1, seatPitch: 0.5, seatType: 'standard' },
      sections: [{ id: 'rear', seatsPerRow: 1 }],
    });
    expect(overhang(config)).toEqual([
      expect.objectContaining({
        params: expect.objectContaining({ rowLabel: 'C', section: 'Rear', band: 'Balcony' }),
      }),
    ]);
  });

  it('does not warn when the line to the screen passes under the slab', () => {
    expect(overhang(narrowBalcony(2.7))).toEqual([]);
    expect(overhang(templates.balcony())).toEqual([]);
  });
});
