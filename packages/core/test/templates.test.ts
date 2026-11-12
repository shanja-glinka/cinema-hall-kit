import { describe, expect, it } from 'vitest';
import { parseHallConfig } from '../src/codec.js';
import { buildHallLayout } from '../src/layout.js';
import { hallConfigJsonSchema } from '../src/json-schema.js';
import { builtInTemplates, templates } from '../src/templates.js';

const errorsOf = (issues: { severity: string }[]) =>
  issues.filter((issue) => issue.severity === 'error');

describe('templates', () => {
  it.each(builtInTemplates.map((t) => [t.id, t] as const))(
    '%s parses with no errors',
    (_id, template) => {
      const result = parseHallConfig(template.create());
      expect(result.ok).toBe(true);
      if (result.ok) expect(errorsOf(result.issues)).toEqual([]);
    },
  );

  it('lists the three built-in templates with labels', () => {
    expect(builtInTemplates.map((t) => t.id)).toEqual(['threeSections', 'single', 'stadium']);
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
