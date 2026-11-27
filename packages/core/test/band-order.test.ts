import { describe, expect, it } from 'vitest';
import { balconySlabSteps } from '../src/band-geometry.js';
import { buildHallLayout } from '../src/layout.js';
import { HallConfigSchema, type BandConfig, type HallConfig } from '../src/schema.js';
import { templates } from '../src/templates.js';
import { validateHall } from '../src/validation.js';
import { layoutBandOverlapRule } from '../src/validation/rules/layout-band-overlap.js';
import { resolveConstraints } from '../src/constraints.js';
import { fixtureConfig } from './support.js';

/** The balcony template with the balcony listed first and the stalls positioned on the floor. */
function balconyFirst(): HallConfig {
  const config = templates.balcony();
  const [stalls, recliners, balcony] = config.layout.bands as [BandConfig, BandConfig, BandConfig];
  stalls.startDistance = config.layout.firstRowDistance;
  stalls.elevation = 0;
  config.layout.bands = [balcony, stalls, recliners];
  return config;
}

describe('band levels do not depend on config order', () => {
  it('puts a balcony listed before the stalls under it on level 1', () => {
    const layout = buildHallLayout(balconyFirst());
    expect(layout.bands.map((band) => [band.id, band.level, band.overhang])).toEqual([
      ['balcony', 1, true],
      ['stalls', 0, false],
      ['recliners', 0, false],
    ]);
    expect(
      layout.seats.filter((seat) => seat.bandId === 'balcony').every((s) => s.level === 1),
    ).toBe(true);
    // The 3D view then draws a slab for it, not a platform from the floor.
    expect(balconySlabSteps(layout).length).toBeGreaterThan(0);
  });

  it('gives the same levels and boxes as the usual order', () => {
    const usual = buildHallLayout(templates.balcony());
    const swapped = buildHallLayout(balconyFirst());
    const byId = (layout: typeof usual) =>
      Object.fromEntries(
        layout.bands.map(({ id, level, overhang, minZ, maxZ, floorElevation, topElevation }) => [
          id,
          { level, overhang, minZ, maxZ, floorElevation, topElevation },
        ]),
      );
    expect(byId(swapped)).toEqual(byId(usual));
  });

  it('checks the clearance under a balcony listed first', () => {
    const config = balconyFirst();
    config.layout.bands[0]!.elevation = 3;
    const issues = validateHall(config).filter((i) => i.code === 'layout.bandOverlap');
    expect(issues.map((i) => [i.path, i.params?.below])).toEqual([
      [['layout', 'bands', 0, 'elevation'], 'Stalls'],
      [['layout', 'bands', 0, 'elevation'], 'Recliners'],
    ]);
  });

  it('keeps a band that continues a balcony on its level', () => {
    const config = balconyFirst();
    config.layout.bands.splice(1, 0, {
      id: 'gallery',
      gapBefore: 1.3,
      riserHeight: 0.4,
      defaults: { rows: 1, rowSpacing: 1, seatPitch: 0.6, seatType: 'balcony' },
      sections: [{ id: 'gallery', seatsPerRow: 10 }],
    });
    const layout = buildHallLayout(config);
    expect(layout.bands.map((band) => [band.id, band.level])).toEqual([
      ['balcony', 1],
      ['gallery', 1],
      ['stalls', 0],
      ['recliners', 0],
    ]);
  });
});

describe('front-row checks use the row nearest the screen', () => {
  /** The fixture with its second band moved in front of the first one. */
  function closerLaterBand(distance: number): HallConfig {
    const config = fixtureConfig();
    config.layout.bands[0]!.startDistance = 10;
    config.layout.bands[1]!.startDistance = distance;
    return config;
  }

  it('warns about a later band that is closer to the screen than the first band', () => {
    const issues = validateHall(closerLaterBand(0.1));
    const close = issues.find((i) => i.code === 'view.firstRowTooClose');
    const vertical = issues.find((i) => i.code === 'view.frontRowVertical');
    expect(close?.path).toEqual(['layout', 'bands', 1, 'startDistance']);
    expect(vertical?.path).toEqual(['layout', 'bands', 1, 'startDistance']);
  });

  it('ignores a front row whose seats are all excluded', () => {
    const config = fixtureConfig();
    const first = config.layout.bands[0]!;
    // Exclude every seat of the first row of every section of the first band.
    for (const section of first.sections) {
      const seats = section.seatsPerRow;
      section.exclude = [
        ...(section.exclude ?? []),
        ...Array.from({ length: seats }, (_, i) => `r1.s${i + 1}`),
      ];
    }
    config.layout.firstRowDistance = 0.5;
    const after = validateHall(config).filter((i) => i.code.startsWith('view.f'));
    // Row 2 now leads: it is one row spacing further, so the ratio is measured from there.
    const ratio = after.find((i) => i.code === 'view.firstRowTooClose');
    const layout = buildHallLayout(config);
    const nearest = Math.min(...layout.seats.map((s) => s.position.z));
    expect(nearest).toBeGreaterThan(0.5);
    expect(ratio?.params?.available).toBe(Math.round((nearest / config.screen.width) * 100) / 100);
    expect(ratio?.path).toEqual(['layout', 'firstRowDistance']);
  });

  it('measures the angle from the floor of the nearest row', () => {
    const config = closerLaterBand(1);
    config.layout.bands[1]!.elevation = 0;
    const low = validateHall(config).find((i) => i.code === 'view.frontRowVertical');
    expect(low).toBeDefined();
    config.layout.bands[1]!.elevation = 6;
    const high = validateHall(config).find((i) => i.code === 'view.frontRowVertical');
    expect(high).toBeUndefined();
  });
});

describe('layout.bandOverlap performance', () => {
  it('checks a 4,800-seat, 32-band layout quickly', () => {
    // 16 ground bands of 5 rows x 30 seats, then 16 deep balconies of 25 rows x 6 seats, so the
    // balcony slabs have 800 steps.
    const bands: BandConfig[] = [];
    for (let i = 0; i < 16; i++) {
      bands.push({
        id: `g${i}`,
        ...(i === 0 ? {} : { gapBefore: 0.9 }),
        defaults: { rows: 5, rowSpacing: 0.9, seatPitch: 0.55, seatType: 'std' },
        sections: [
          { id: `g${i}l`, seatsPerRow: 15 },
          { id: `g${i}r`, seatsPerRow: 15, gapBefore: 1.2 },
        ],
      });
    }
    for (let i = 0; i < 16; i++) {
      bands.push({
        id: `b${i}`,
        ...(i === 0 ? { startDistance: 4, elevation: 4 } : { gapBefore: 0.9 }),
        riserHeight: 0.01,
        defaults: { rows: 25, rowSpacing: 0.9, seatPitch: 0.55, seatType: 'std' },
        sections: [
          { id: `b${i}l`, seatsPerRow: 3 },
          { id: `b${i}r`, seatsPerRow: 3, gapBefore: 1.2 },
        ],
      });
    }
    const config: HallConfig = HallConfigSchema.parse({
      version: 1,
      name: 'Large',
      hall: { width: 20, depth: 400, height: 30 },
      screen: { width: 12, height: 5, elevation: 1 },
      seatTypes: { std: { label: 'Standard', width: 0.5, depth: 0.5, color: '#888888' } },
      layout: { firstRowDistance: 4, bands },
    });
    const layout = buildHallLayout(config);
    expect(layout.seats.length).toBe(4800);
    expect(layout.bands.length).toBe(32);
    expect(layout.bands.filter((band) => band.level === 1).length).toBe(16);
    const constraints = resolveConstraints(config);
    const ctx = { config, constraints, layout } as Parameters<
      typeof layoutBandOverlapRule.check
    >[0];
    expect(layoutBandOverlapRule.check(ctx)).toEqual([]);
    // Best of three runs. Before the slab steps were indexed by band this took about 100 ms here
    // (over a second on slower machines); now it takes a few.
    let best = Infinity;
    for (let run = 0; run < 3; run++) {
      const start = performance.now();
      layoutBandOverlapRule.check(ctx);
      best = Math.min(best, performance.now() - start);
    }
    expect(best).toBeLessThan(60);
  });
});
