import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseHallConfig } from '../src/codec.js';
import { buildHallLayout } from '../src/layout.js';
import { computeSeatView } from '../src/metrics.js';
import { hallConfigJsonSchema } from '../src/json-schema.js';
import { builtInTemplates, templatePrices, templateTexts, templates } from '../src/templates.js';

const exampleYaml = readFileSync(
  new URL('../../../docs/examples/meridian-hall-3.yaml', import.meta.url),
  'utf8',
);

describe('templates', () => {
  it.each(builtInTemplates.map((t) => [t.id, t] as const))(
    '%s opens with no errors and no warnings',
    (_id, template) => {
      const result = parseHallConfig(template.create());
      expect(result.ok).toBe(true);
      expect(result.issues).toEqual([]);
    },
  );

  it('lists the built-in templates with labels', () => {
    expect(builtInTemplates.map((t) => t.id)).toEqual([
      'threeSections',
      'single',
      'stadium',
      'balcony',
    ]);
    expect(builtInTemplates.every((t) => t.label.length > 0)).toBe(true);
  });

  it('threeSections reproduces the concept: 7 standard rows and 2 recliner rows', () => {
    const layout = buildHallLayout(templates.threeSections());
    expect(layout.rows).toHaveLength(9);
    expect(layout.seats).toHaveLength(126);
    expect(layout.seats.filter((s) => s.seatTypeId === 'recliner')).toHaveLength(28);
  });

  it('accepts custom options structurally', () => {
    expect(
      parseHallConfig(templates.threeSections({ rows: 3, seats: [2, 4, 2], aisle: 0.9 })).ok,
    ).toBe(true);
    expect(parseHallConfig(templates.single({ rows: 3, seats: 4 })).ok).toBe(true);
    expect(parseHallConfig(templates.stadium({ frontRows: 2, rearRows: 2, seats: 6 })).ok).toBe(
      true,
    );
  });
});

describe('template texts and prices', () => {
  it.each(builtInTemplates.map((t) => [t.id, t] as const))(
    '%s prices every seat type of its layout',
    (_id, template) => {
      const config = template.create();
      const layout = buildHallLayout(config);
      const tiers = new Set(layout.seats.map((seat) => seat.priceTier));
      for (const tier of tiers) expect(config.pricing?.tiers[tier]).toBeGreaterThan(0);
      for (const id of Object.keys(config.seatTypes)) {
        expect(config.pricing?.tiers[id]).toBe(templatePrices[id as keyof typeof templatePrices]);
      }
    },
  );

  it('writes the English hall name, seat type labels and band labels', () => {
    const config = templates.balcony();
    expect(config.name).toBe('Two-level hall');
    expect(config.seatTypes.standard!.label).toBe('Classic');
    expect(config.seatTypes.recliner!.label).toBe('Lounge');
    expect(config.seatTypes.balcony!.label).toBe('Balcony');
    expect(config.layout.bands.map((band) => band.label)).toEqual([
      'Stalls',
      'Recliners',
      'Balcony',
    ]);
    expect(templates.single().layout.bands[0]!.label).toBe('Stalls');
    expect(templates.stadium().seatTypes.premium!.label).toBe('Premium');
  });

  it('lets texts replace single entries and keeps ids, geometry and prices', () => {
    expect(templates.balcony().name).toBe(templateTexts.names.balcony);
    const plain = templates.threeSections({ rows: 3 });
    const custom = templates.threeSections({
      rows: 3,
      texts: { names: { threeSections: 'Hall 5' }, seatTypes: { recliner: 'Sofa' } },
    });
    expect(custom.name).toBe('Hall 5');
    expect(custom.seatTypes.recliner!.label).toBe('Sofa');
    expect(custom.seatTypes.standard!.label).toBe('Classic');
    expect(Object.keys(custom.seatTypes)).toEqual(Object.keys(plain.seatTypes));
    expect(custom.pricing).toEqual(plain.pricing);
    expect(buildHallLayout(custom).seats.map((seat) => seat.key)).toEqual(
      buildHallLayout(plain).seats.map((seat) => seat.key),
    );
    expect(buildHallLayout(custom).rows).toHaveLength(5);
    expect(parseHallConfig(custom).issues).toEqual([]);
  });

  it('has every text', () => {
    for (const group of [templateTexts.names, templateTexts.seatTypes, templateTexts.bands]) {
      for (const value of Object.values(group)) expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe('docs/examples/meridian-hall-3.yaml', () => {
  it('validates with no errors and no warnings', () => {
    const result = parseHallConfig(exampleYaml);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('keeps the concept seat counts: 7 standard rows and 2 recliner rows', () => {
    const result = parseHallConfig(exampleYaml);
    if (!result.ok) throw new Error('the example does not parse');
    const layout = buildHallLayout(result.config);
    expect(layout.rows).toHaveLength(9);
    expect(layout.seats).toHaveLength(126);
  });

  it.each([
    ['B4', 7.6, 76, -2.1, 'up-close'],
    ['F8', 10.8, 56, 0.3, 'sweet-spot'],
    ['I12', 14.5, 42, 3.7, 'full-picture'],
  ])(
    'metrics of %s match the sample column of concept-analysis §3',
    (label, dist, fov, offset, zone) => {
      const result = parseHallConfig(exampleYaml);
      if (!result.ok) throw new Error('the example does not parse');
      const layout = buildHallLayout(result.config);
      const seat = layout.seats.find((s) => s.label === label)!;
      const m = computeSeatView(layout, seat.key)!;
      expect(m.distance).toBeCloseTo(dist, 1);
      expect(Math.round(m.fovDeg)).toBe(fov);
      expect(m.lateralOffset).toBeCloseTo(offset, 5);
      expect(m.zone.id).toBe(zone);
    },
  );
});

describe('hallConfigJsonSchema', () => {
  it('is a non-empty object that describes the version property', () => {
    expect(typeof hallConfigJsonSchema).toBe('object');
    expect(Object.keys(hallConfigJsonSchema).length).toBeGreaterThan(0);
    const properties = hallConfigJsonSchema.properties as Record<string, unknown>;
    expect(properties).toHaveProperty('version');
    expect(properties).toHaveProperty('layout');
  });

  it('carries the published id and title', () => {
    expect(hallConfigJsonSchema.$id).toBe('https://cinema-hall.dev/schema/hall-config-v1.json');
    expect(hallConfigJsonSchema.title).toContain('Cinema hall');
  });
});
