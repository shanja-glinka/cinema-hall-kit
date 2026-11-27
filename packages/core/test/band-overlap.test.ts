/** `layout.bandOverlap`: seats of two bands, or a seat and a balcony slab, that would share a place. */
import { describe, expect, it } from 'vitest';
import { buildHallLayout } from '../src/layout.js';
import { HallConfigSchema, type HallConfig } from '../src/schema.js';
import { templates } from '../src/templates.js';
import { validateHall } from '../src/validation.js';
import { fixtureConfig, fixtureRaw } from './support.js';

/** The balcony template with its balcony band copied: both copies sit on the same level. */
function duplicatedBalcony(): HallConfig {
  const config = templates.balcony();
  const balcony = config.layout.bands.find((band) => band.startDistance !== undefined)!;
  const copy = structuredClone(balcony);
  copy.id = `${balcony.id}-copy`;
  copy.label = 'Balcony copy';
  copy.sections = copy.sections.map((section) => ({ ...section, id: `${section.id}-copy` }));
  return HallConfigSchema.parse({
    ...config,
    layout: { ...config.layout, bands: [...config.layout.bands, copy] },
  });
}

const overlaps = (config: HallConfig) =>
  validateHall(config).filter((issue) => issue.code === 'layout.bandOverlap');

/**
 * A stalls row of deep seats (0.9 m) whose centres stay in front of the balcony slab while the
 * back of each seat reaches under it.
 */
function deepSeatsUnderSlab(startDistance: number, elevation = 1): HallConfig {
  return HallConfigSchema.parse({
    version: 1,
    name: 'Deep seats',
    hall: { width: 6, depth: 9, height: 6 },
    screen: { width: 4, height: 2, elevation: 0.5 },
    seatTypes: { deep: { label: 'Recliner', width: 0.6, depth: 0.9, color: '#5E636B' } },
    layout: {
      firstRowDistance: 4,
      bands: [
        {
          id: 'stalls',
          defaults: { rows: 1, rowSpacing: 1, seatPitch: 0.7, seatType: 'deep' },
          sections: [{ id: 'stalls', seatsPerRow: 2 }],
        },
        {
          id: 'balcony',
          startDistance,
          elevation,
          defaults: { rows: 1, rowSpacing: 1, seatPitch: 0.7, seatType: 'deep' },
          sections: [{ id: 'balcony', seatsPerRow: 2 }],
        },
      ],
    },
  });
}

const overlap = (config: HallConfig) =>
  validateHall(config).filter((issue) => issue.code === 'layout.bandOverlap');

describe('layout.bandOverlap for bands on the same level', () => {
  it('reports two balconies that occupy the same place', () => {
    const config = duplicatedBalcony();
    const layout = buildHallLayout(config);
    const levels = layout.bands.filter((band) => band.level >= 1).map((band) => band.level);
    expect(levels.length).toBe(2);
    expect(new Set(levels).size).toBe(1);
    const issues = validateHall(config, { enforce: true }).filter(
      (issue) => issue.code === 'layout.bandOverlap',
    );
    expect(issues.length).toBe(1);
    expect(issues[0]!.severity).toBe('error');
    expect(issues[0]!.path).toEqual([
      'layout',
      'bands',
      config.layout.bands.length - 1,
      'elevation',
    ]);
    expect(issues[0]!.params).toMatchObject({ band: 'Balcony copy' });
  });

  it('keeps the balcony template itself free of overlap errors', () => {
    const issues = validateHall(templates.balcony(), { enforce: true }).filter(
      (issue) => issue.code === 'layout.bandOverlap',
    );
    expect(issues).toEqual([]);
  });

  it('accepts a balcony raised clear above its copy', () => {
    const config = duplicatedBalcony();
    const copy = config.layout.bands.at(-1)!;
    copy.elevation = (copy.elevation ?? 0) + 4;
    const issues = validateHall(config).filter((issue) => issue.code === 'layout.bandOverlap');
    expect(issues).toEqual([]);
  });
});

describe('layout.bandOverlap for consecutive bands', () => {
  /** The fixture with its recliners band moved to `gap` metres behind the stalls. */
  function withGap(gap: number, riser?: number): HallConfig {
    const raw = fixtureRaw();
    raw.layout.bands[1].gapBefore = gap;
    if (riser !== undefined) raw.layout.bands[1].riserHeight = riser;
    return HallConfigSchema.parse(raw);
  }

  it('keeps the fixture and every template free of overlap errors', () => {
    expect(overlaps(fixtureConfig())).toEqual([]);
    for (const make of Object.values(templates)) expect(overlaps(make())).toEqual([]);
  });

  it('reports a band whose first row sits on the last row of the band before it', () => {
    const config = withGap(0.1);
    const issues = overlaps(config);
    expect(issues.length).toBe(1);
    expect(issues[0]!.severity).toBe('error');
    expect(issues[0]!.path).toEqual(['layout', 'bands', 1, 'gapBefore']);
    expect(issues[0]!.params).toMatchObject({ band: 'Recliners', below: 'Main', rowLabel: 'G' });
  });

  it('reports seats of consecutive bands whose bodies overlap', () => {
    // 0.6 m and 0.8 m deep seats need at least 0.7 m between their row centres.
    expect(overlaps(withGap(0.65)).length).toBe(1);
    expect(overlaps(withGap(0.7))).toEqual([]);
    expect(overlaps(withGap(0.9))).toEqual([]);
  });

  it('accepts a following band raised a full storey above the rows it covers', () => {
    expect(overlaps(withGap(0.1, 3))).toEqual([]);
  });
});

describe('layout.bandOverlap compares seat bodies on the same level', () => {
  /** Two bands at the same place and height: two seats at ±0.35 m, then one centred seat. */
  function sideBySide(): HallConfig {
    const raw = fixtureRaw();
    const at = raw.layout.firstRowDistance;
    raw.layout.bands = [
      {
        id: 'pair',
        defaults: { rows: 1, rowSpacing: 0.95, seatPitch: 0.7, seatType: 'standard' },
        sections: [{ id: 'pair', seatsPerRow: 2 }],
      },
      {
        id: 'single',
        startDistance: at,
        defaults: { rows: 1, rowSpacing: 0.95, seatPitch: 0.6, seatType: 'standard' },
        sections: [{ id: 'single', seatsPerRow: 1 }],
      },
    ];
    return HallConfigSchema.parse(raw);
  }

  it('reports a seat that intersects seats whose centres lie outside its section', () => {
    const config = sideBySide();
    const layout = buildHallLayout(config);
    expect(layout.seats.map((seat) => seat.position.x)).toEqual([-0.35, 0.35, 0]);
    const issues = overlaps(config);
    expect(issues.length).toBe(1);
    expect(issues[0]!.params).toMatchObject({ band: 'Single', below: 'Pair' });
  });

  it('accepts the same bands when the seats are far enough apart', () => {
    const raw = JSON.parse(JSON.stringify(sideBySide()));
    raw.layout.bands[0].defaults.seatPitch = 1.4;
    expect(overlaps(HallConfigSchema.parse(raw))).toEqual([]);
  });
});

describe('layout.bandOverlap for bands placed with startDistance', () => {
  /** Two one-row bands with 0.2 m row spacing; the second starts `gap` metres behind the first. */
  function twoBands(gap: number, mode: 'startDistance' | 'gapBefore'): HallConfig {
    const raw = fixtureRaw();
    const at = raw.layout.firstRowDistance;
    const defaults = { rows: 1, rowSpacing: 0.2, seatPitch: 0.7, seatType: 'standard' };
    raw.layout.bands = [
      { id: 'front', defaults, sections: [{ id: 'front', seatsPerRow: 4 }] },
      {
        id: 'back',
        ...(mode === 'startDistance' ? { startDistance: at + gap } : { gapBefore: gap }),
        defaults,
        sections: [{ id: 'back', seatsPerRow: 4 }],
      },
    ];
    return HallConfigSchema.parse(raw);
  }

  it('reports seat bodies that overlap although the row strips do not', () => {
    const config = twoBands(0.4, 'startDistance');
    const depth = buildHallLayout(config).seatTypes['standard']!.depth;
    expect(depth).toBeGreaterThan(0.4);
    const issues = overlaps(config);
    expect(issues.length).toBe(1);
    expect(issues[0]!.path).toEqual(['layout', 'bands', 1, 'startDistance']);
    expect(issues[0]!.params).toMatchObject({ band: 'Back', below: 'Front' });
  });

  it('judges the same geometry the same way as gapBefore', () => {
    expect(overlaps(twoBands(0.4, 'gapBefore')).length).toBe(1);
    const far = 1.5;
    expect(overlaps(twoBands(far, 'startDistance'))).toEqual([]);
    expect(overlaps(twoBands(far, 'gapBefore'))).toEqual([]);
  });
});

describe('layout.bandOverlap compares seat bodies with the balcony slab', () => {
  it('reports a seat whose centre is in front of the slab but whose body reaches under it', () => {
    // The slab starts at 4.4 m; the stalls seats are centred at 4 m and reach 4.45 m.
    const issues = overlap(deepSeatsUnderSlab(4.9));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.params).toMatchObject({ band: 'Balcony', below: 'Stalls', rowLabel: 'A' });
  });

  it('accepts the balcony once its slab starts behind the seat bodies', () => {
    expect(overlap(deepSeatsUnderSlab(5))).toEqual([]);
  });

  it('reports the recliners of the balcony template when the balcony starts 0.1 m further back', () => {
    const config = templates.balcony();
    config.layout.bands[2]!.startDistance = 12;
    // The front of the first recliner row (centred at 12.9 m, 0.9 m deep) reaches under the
    // first slab step (11.5 to 12.5 m).
    expect(overlap(config).map((issue) => issue.params)).toEqual([
      expect.objectContaining({ band: 'Balcony', below: 'Recliners', rowLabel: 'H' }),
    ]);
    expect(overlap(templates.balcony())).toEqual([]);
  });
});
