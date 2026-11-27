import { describe, expect, it } from 'vitest';
import { parseHallConfig } from '../src/codec.js';
import { buildHallLayout } from '../src/layout.js';
import { BandSchema, ConstraintsSchema, DEFAULT_CONSTRAINTS } from '../src/schema.js';
import { builtInTemplates, templates } from '../src/templates.js';
import { formatIssue, validateHall } from '../src/validation.js';
import { fieldKeyForPath } from '../src/fields.js';
import { hallConfigJsonSchema } from '../src/json-schema.js';
import type { IssueCode } from '../src/issues.js';
import { fixtureConfig } from './support.js';

const codes = (issues: { code: IssueCode }[]) => issues.map((issue) => issue.code);

describe('multi-level layout', () => {
  const config = templates.balcony();
  const layout = buildHallLayout(config);

  it('places a band with startDistance and elevation over the rear stalls', () => {
    const balcony = layout.rows.filter((row) => row.bandId === 'balcony');
    expect(balcony.map((row) => [row.label, row.elevation, row.level])).toEqual([
      ['J', 4.5, 1],
      ['K', 5.1, 1],
      ['L', 5.7, 1],
    ]);
    const firstSeat = layout.seats.find((seat) => seat.key === 'balcony.r1.s1')!;
    expect(firstSeat.position.z).toBe(11.9);
    expect(firstSeat.position.y).toBe(4.5);
    expect(firstSeat.eye.y).toBe(5.65);
    expect(firstSeat.level).toBe(1);
  });

  it('reports band boxes with levels and the overhang', () => {
    expect(layout.bands).toEqual([
      {
        id: 'stalls',
        label: 'Stalls',
        index: 0,
        level: 0,
        minZ: 5.525,
        maxZ: 12.175,
        floorElevation: 0,
        topElevation: 1.5,
        overhang: false,
      },
      {
        id: 'recliners',
        label: 'Recliners',
        index: 1,
        level: 0,
        minZ: 12.3,
        maxZ: 14.7,
        floorElevation: 1.85,
        topElevation: 2.2,
        overhang: false,
      },
      {
        id: 'balcony',
        label: 'Balcony',
        index: 2,
        level: 1,
        minZ: 11.4,
        maxZ: 14.4,
        floorElevation: 4.5,
        topElevation: 5.7,
        overhang: true,
      },
    ]);
    const box = layout.sections.find((section) => section.sectionId === 'balcony')!;
    expect(box).toMatchObject({ level: 1, floorElevation: 4.5, minZ: 11.4, maxZ: 14.4 });
    expect(layout.sections.find((s) => s.sectionId === 'rec-left')).toMatchObject({
      level: 0,
      floorElevation: 1.85,
    });
  });

  it('ignores gapBefore when startDistance is set', () => {
    const moved = templates.balcony();
    moved.layout.bands[2]!.gapBefore = 7;
    expect(buildHallLayout(moved).bands[2]!.minZ).toBe(11.4);
  });

  it('continues a later band after the positioned band, rising from its last row', () => {
    const extended = templates.balcony();
    extended.layout.bands.push({
      id: 'gallery',
      gapBefore: 1.3,
      riserHeight: 0.4,
      defaults: { rows: 1, rowSpacing: 1, seatPitch: 0.6, seatType: 'balcony' },
      sections: [{ id: 'gallery', seatsPerRow: 10 }],
    });
    const next = buildHallLayout(extended);
    const row = next.rows.find((item) => item.bandId === 'gallery')!;
    expect(row).toMatchObject({ label: 'M', elevation: 6.1, level: 1 });
    expect(next.seats.find((seat) => seat.key === 'gallery.r1.s1')!.position.z).toBe(15.2);
    expect(next.bands[3]).toMatchObject({ level: 1, overhang: false, floorElevation: 6.1 });
  });

  it('restarts the rake from elevation without startDistance and stays on the ground floor', () => {
    const config2 = fixtureConfig();
    config2.layout.bands[1]!.elevation = 2;
    const next = buildHallLayout(config2);
    expect(next.rows.slice(-2).map((row) => [row.elevation, row.level])).toEqual([
      [2, 0],
      [2.3, 0],
    ]);
  });

  it('keeps a config without the new fields on one level, with the old positions', () => {
    const legacy = buildHallLayout(fixtureConfig());
    expect(legacy.rows.map((row) => row.elevation)).toEqual([
      0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.2, 1.5,
    ]);
    expect(legacy.seats.every((seat) => seat.level === 0)).toBe(true);
    expect(legacy.bands.map((band) => [band.id, band.level, band.overhang])).toEqual([
      ['main', 0, false],
      ['recliners', 0, false],
    ]);
    expect(legacy.bands[1]!.floorElevation).toBe(1.2);
    expect(legacy.bands[0]).not.toHaveProperty('label');
  });

  it('accepts the new band and constraint fields in the schema', () => {
    expect(BandSchema.safeParse({ id: 'b', startDistance: 0, sections: [] }).success).toBe(false);
    expect(
      BandSchema.safeParse({
        id: 'b',
        label: 'Balcony',
        startDistance: 10,
        elevation: 0,
        sections: [{ id: 's', seatsPerRow: 1 }],
      }).success,
    ).toBe(true);
    expect(BandSchema.safeParse({ id: 'b', elevation: -1, sections: [] }).success).toBe(false);
    expect(ConstraintsSchema.safeParse({ minOverhangClearance: 2 }).success).toBe(true);
    expect(DEFAULT_CONSTRAINTS).toMatchObject({
      minOverhangClearance: 2.4,
      balconySlabThickness: 0.3,
      balconyParapetHeight: 0.8,
    });
  });

  it('publishes the new fields in the JSON Schema', () => {
    const text = JSON.stringify(hallConfigJsonSchema);
    for (const key of [
      'startDistance',
      'elevation',
      'minOverhangClearance',
      'balconySlabThickness',
      'balconyParapetHeight',
    ]) {
      expect(text).toContain(`"${key}"`);
    }
  });

  it('reports the balcony slab and parapet sizes, from the constraints or the defaults', () => {
    expect(layout.balconySlabThickness).toBe(DEFAULT_CONSTRAINTS.balconySlabThickness);
    expect(layout.balconyParapetHeight).toBe(DEFAULT_CONSTRAINTS.balconyParapetHeight);
    const custom = structuredClone(config);
    custom.constraints = { ...custom.constraints, balconySlabThickness: 0.45 };
    const built = buildHallLayout(custom);
    expect(built.balconySlabThickness).toBe(0.45);
    expect(built.balconyParapetHeight).toBe(0.8);
    custom.constraints = { balconyParapetHeight: 1.1 };
    expect(buildHallLayout(custom).balconyParapetHeight).toBe(1.1);
    expect(buildHallLayout(custom).balconySlabThickness).toBe(0.3);
    // A single-level hall reports them too, so a renderer never has to guess.
    expect(buildHallLayout(fixtureConfig()).balconySlabThickness).toBe(0.3);
  });

  it('maps the new band fields to field keys', () => {
    expect(fieldKeyForPath(['layout', 'bands', 2, 'startDistance'])).toBe('band.startDistance');
    expect(fieldKeyForPath(['layout', 'bands', 2, 'elevation'])).toBe('band.elevation');
    expect(fieldKeyForPath(['layout', 'bands', 2, 'label'])).toBe('band.label');
  });
});

describe('balcony template', () => {
  it('is listed with its label and parses with no issues at all', () => {
    expect(builtInTemplates.find((t) => t.id === 'balcony')?.label).toBe(
      'Two levels: stalls + balcony',
    );
    const result = parseHallConfig(templates.balcony());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.issues).toEqual([]);
    expect(validateHall(templates.balcony())).toEqual([]);
  });

  it('has 240 seats: 3 stalls sections, 2 recliner rows and a balcony seat type', () => {
    const layout = buildHallLayout(templates.balcony());
    expect(layout.seats).toHaveLength(240);
    expect(layout.seats.filter((s) => s.seatTypeId === 'recliner')).toHaveLength(44);
    expect(layout.seats.filter((s) => s.seatTypeId === 'balcony')).toHaveLength(42);
    expect(layout.seatTypes.balcony?.label).toBe('Balcony');
    expect(layout.sections.filter((s) => s.bandId === 'stalls')).toHaveLength(3);
  });
});

describe('multi-level validation', () => {
  it('reports layout.bandOverlap when the balcony is too low over the rows under it', () => {
    const config = templates.balcony();
    config.layout.bands[2]!.elevation = 3;
    const issues = validateHall(config).filter((i) => i.code === 'layout.bandOverlap');
    expect(issues).toEqual([
      {
        severity: 'error',
        code: 'layout.bandOverlap',
        path: ['layout', 'bands', 2, 'elevation'],
        ref: { bandId: 'balcony' },
        params: { required: 4.2, available: 3, rowLabel: 'G', band: 'Balcony', below: 'Stalls' },
      },
      expect.objectContaining({
        params: expect.objectContaining({ rowLabel: 'H', below: 'Recliners' }),
      }),
    ]);
    expect(formatIssue(issues[0]!)).toBe(
      'Band “Balcony” is too low over row G of band “Stalls”: its floor there must be at least 4.2 m high, it is 3 m',
    );
  });

  it('honours minOverhangClearance and the slab thickness', () => {
    const config = templates.balcony();
    expect(codes(validateHall(config, { constraints: { minOverhangClearance: 3 } }))).toContain(
      'layout.bandOverlap',
    );
    expect(codes(validateHall(config, { constraints: { balconySlabThickness: 0.7 } }))).toContain(
      'layout.bandOverlap',
    );
  });

  it('reports a band overlap for a positioned band at floor level', () => {
    const config = templates.balcony();
    delete config.layout.bands[2]!.elevation;
    const issues = validateHall(config).filter((i) => i.code === 'layout.bandOverlap');
    expect(issues.map((i) => i.path)).toEqual([
      ['layout', 'bands', 2, 'startDistance'],
      ['layout', 'bands', 2, 'startDistance'],
    ]);
  });

  it('warns with view.overhang when the balcony hides the top of the screen', () => {
    const config = templates.balcony();
    config.layout.bands[2]!.startDistance = 10;
    const issues = validateHall(config);
    // The slab spans the hall's width, so the side sections beside the balcony seats are hidden too.
    expect(codes(issues)).toEqual(['view.overhang', 'view.overhang', 'view.overhang']);
    expect(issues.map((issue) => issue.ref?.sectionId)).toEqual([
      'rec-left',
      'rec-centre',
      'rec-right',
    ]);
    expect(issues[1]).toMatchObject({
      severity: 'warning',
      path: ['layout', 'bands', 1, 'sections', 1],
      ref: { bandId: 'recliners', sectionId: 'rec-centre' },
      params: { row: 2, rowLabel: 'I', section: 'Rec centre', band: 'Balcony' },
    });
    expect(formatIssue(issues[1]!)).toBe(
      'In section “Rec centre”, band “Balcony” above hides the top of the screen from row I',
    );
  });

  it('treats the balcony front barrier as an obstacle for the balcony rows', () => {
    const issues = validateHall(templates.balcony(), {
      constraints: { balconyParapetHeight: 1.5 },
    });
    expect(issues).toEqual([
      expect.objectContaining({
        code: 'view.sightline',
        path: ['layout', 'bands', 2, 'sections', 0],
        params: { row: 1, rowLabel: 'J', section: 'Balcony' },
      }),
    ]);
  });

  it('does not compare the stalls with the heads of the balcony above them', () => {
    // The balcony seats are in front of the last recliner row and far above it; on one level they
    // would block it.
    expect(codes(validateHall(templates.balcony()))).not.toContain('view.sightline');
  });

  it('checks the ceiling above the balcony and names it', () => {
    const config = templates.balcony();
    config.hall.height = 7;
    expect(validateHall(config)).toEqual([
      expect.objectContaining({
        code: 'fit.headroom',
        path: ['hall', 'height'],
        params: { required: 7.35, available: 7, band: 'Balcony' },
      }),
    ]);
    expect(validateHall(config)[0]!.ref).toBeUndefined();
  });

  it('attaches fit.depth to the band of the rearmost seat', () => {
    const config = templates.balcony();
    config.hall.depth = 15;
    expect(validateHall(config)).toEqual([
      expect.objectContaining({
        code: 'fit.depth',
        path: ['hall', 'depth'],
        ref: { bandId: 'recliners' },
        params: { required: 15.55, available: 15, band: 'Recliners' },
      }),
    ]);
  });

  it('measures the first row from the first band startDistance when it has one', () => {
    const config = fixtureConfig();
    config.layout.bands[0]!.startDistance = 3;
    const issues = validateHall(config).filter((i) => i.code === 'view.firstRowTooClose');
    expect(issues.map((i) => i.path)).toEqual([['layout', 'bands', 0, 'startDistance']]);
  });
});
