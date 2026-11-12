import { describe, expect, it } from 'vitest';
import type { FieldPolicy } from '../src/fields.js';
import { validateEdit } from '../src/validation.js';
import { fixtureConfig } from './support.js';

const fieldsOf = (issues: { params?: Record<string, string | number> }[]) =>
  issues.map((issue) => issue.params?.field).sort();

const lock = (...fields: string[]): FieldPolicy =>
  Object.fromEntries(fields.map((field) => [field, 'locked'])) as FieldPolicy;

describe('validateEdit: subtrees that exist on one side only', () => {
  it('reports a locked leaf of band defaults that were deleted', () => {
    const next = fixtureConfig();
    delete next.layout.bands[0]!.defaults;
    for (const section of next.layout.bands[0]!.sections) {
      Object.assign(section, { rows: 7, rowSpacing: 0.95, seatPitch: 0.6, seatType: 'standard' });
    }
    const issues = validateEdit(fixtureConfig(), next, lock('band.rows'));
    expect(fieldsOf(issues)).toEqual(['band.rows']);
    expect(issues[0]?.path).toEqual(['layout', 'bands', 0, 'defaults', 'rows']);
  });

  it('reports a locked leaf of band defaults that were added', () => {
    const prev = fixtureConfig();
    delete prev.layout.bands[0]!.defaults;
    expect(fieldsOf(validateEdit(prev, fixtureConfig(), lock('band.rows')))).toEqual(['band.rows']);
  });

  it('reports a locked field of a section that was removed', () => {
    const next = fixtureConfig();
    next.layout.bands[0]!.sections.splice(1, 1);
    const issues = validateEdit(fixtureConfig(), next, lock('section.seatsPerRow'));
    expect(fieldsOf(issues)).toEqual(['section.seatsPerRow']);
  });
});

describe('validateEdit: renamed and duplicated items', () => {
  it('reports a locked change made to a section in the same edit as its rename', () => {
    const next = fixtureConfig();
    const centre = next.layout.bands[0]!.sections[1]!;
    centre.id = 'middle';
    centre.seatsPerRow = 9;
    const issues = validateEdit(
      fixtureConfig(),
      next,
      lock('section.seatsPerRow', 'structure.sections'),
    );
    expect(fieldsOf(issues)).toEqual(['section.seatsPerRow', 'structure.sections']);
  });

  it('compares items with a duplicated id by position, not with the first one', () => {
    const prev = fixtureConfig();
    prev.meta = {
      items: [
        { id: 'a', v: 1 },
        { id: 'a', v: 2 },
      ],
    };
    const next = fixtureConfig();
    next.meta = {
      items: [
        { id: 'a', v: 1 },
        { id: 'a', v: 1 },
      ],
    };
    expect(validateEdit(prev, next, lock('meta'))).toEqual([
      expect.objectContaining({ path: ['meta', 'items', 1, 'v'], params: { field: 'meta' } }),
    ]);
  });
});

describe('validateEdit: id lists are compared element by element', () => {
  it('reports an item added under a hidden field when its id is empty', () => {
    const prev = fixtureConfig();
    prev.meta = { items: [] };
    const next = fixtureConfig();
    next.meta = { items: [{ id: '', value: 1 }] };
    expect(validateEdit(prev, next, { meta: 'hidden' })).toEqual([
      expect.objectContaining({ code: 'field.locked', params: { field: 'meta' } }),
    ]);
  });

  it('does not let an id that contains the separator of a join hide the change', () => {
    const prev = fixtureConfig();
    prev.meta = { items: [{ id: 'a\u0000b', value: 1 }] };
    const next = fixtureConfig();
    next.meta = {
      items: [
        { id: 'a', value: 1 },
        { id: 'b', value: 1 },
      ],
    };
    expect(fieldsOf(validateEdit(prev, next, lock('meta')))).toEqual(['meta']);
  });
});

describe('validateEdit: ref of a removed item', () => {
  it('reads the ref of a removed section from the config it was removed from', () => {
    const next = fixtureConfig();
    next.layout.bands[0]!.sections.splice(1, 1);
    const issues = validateEdit(fixtureConfig(), next, lock('section.seatsPerRow'));
    expect(issues).toEqual([
      expect.objectContaining({
        path: ['layout', 'bands', 0, 'sections', 1, 'seatsPerRow'],
        ref: { bandId: 'main', sectionId: 'centre' },
      }),
    ]);
  });
});

describe('validateEdit: the policy is read by its effective value', () => {
  it('honours a locked field inherited through the prototype of the policy', () => {
    const next = fixtureConfig();
    next.hall.width = 15;
    const policy = Object.create({ 'hall.width': 'locked' }) as FieldPolicy;
    expect(fieldsOf(validateEdit(fixtureConfig(), next, policy))).toEqual(['hall.width']);
  });

  it('ignores a value that is not one of the access levels', () => {
    const next = fixtureConfig();
    next.hall.width = 15;
    const policy = { 'hall.width': 'LOCKED' } as unknown as FieldPolicy;
    expect(validateEdit(fixtureConfig(), next, policy)).toEqual([]);
  });
});

describe('review round 3 regressions', () => {
  it('reads the ref of a removed field from its section after the sections were reordered', () => {
    const prev = fixtureConfig();
    prev.layout.bands[0]!.sections[0]!.color = '#123456';
    const next = structuredClone(prev);
    next.layout.bands[0]!.sections.reverse();
    delete next.layout.bands[0]!.sections[2]!.color;
    const issues = validateEdit(prev, next, { 'section.color': 'locked' });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ref?.sectionId).toBe('left');
  });

  it('does not treat an inherited property as equal to an own one', () => {
    const prev = fixtureConfig();
    prev.meta = JSON.parse('{"__proto__":{}}') as Record<string, unknown>;
    const next = structuredClone(fixtureConfig());
    next.meta = { replacement: {} };
    expect(validateEdit(prev, next, { meta: 'hidden' }).length).toBeGreaterThan(0);
  });
});
