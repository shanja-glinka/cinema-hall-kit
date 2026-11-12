import { describe, expect, it } from 'vitest';
import { buildHallLayout } from '../src/layout.js';
import { createSeatIndex } from '../src/seat-index.js';
import { selectionRules, validateSelection } from '../src/selection.js';
import type { Occupancy, SelectionRule, SelectionRuleContext } from '../src/session.js';
import { createStatusLookup } from '../src/session.js';
import { fixtureConfig } from './support.js';

const layout = buildHallLayout(fixtureConfig());
const index = createSeatIndex(layout);
const ctx = (keys: string[], occupancy?: Occupancy): SelectionRuleContext => ({
  keys,
  layout,
  index,
  status: createStatusLookup(occupancy),
});

describe('selectionRules.max', () => {
  it('reports when there are more seats than allowed', () => {
    const rule = selectionRules.max(2);
    expect(rule(ctx(['centre.r1.s1', 'centre.r1.s2', 'centre.r1.s3']))).toEqual({
      code: 'max',
      keys: ['centre.r1.s1', 'centre.r1.s2', 'centre.r1.s3'],
      params: { max: 2 },
    });
  });

  it('is silent at the limit', () => {
    expect(selectionRules.max(2)(ctx(['centre.r1.s1', 'centre.r1.s2']))).toBeNull();
  });
});

describe('selectionRules.sameRow', () => {
  it('reports seats from different rows', () => {
    expect(selectionRules.sameRow()(ctx(['centre.r1.s1', 'centre.r2.s1']))).toMatchObject({
      code: 'sameRow',
    });
  });

  it('reports a key that is not in the layout', () => {
    expect(selectionRules.sameRow()(ctx(['centre.r1.s1', 'nowhere.r1.s1']))).toMatchObject({
      code: 'sameRow',
    });
  });

  it('is silent for seats in one row, and for no seats', () => {
    expect(selectionRules.sameRow()(ctx(['centre.r1.s1', 'centre.r1.s4']))).toBeNull();
    expect(selectionRules.sameRow()(ctx([]))).toBeNull();
  });
});

describe('selectionRules.adjacent', () => {
  it('reports a gap in the run', () => {
    expect(selectionRules.adjacent()(ctx(['centre.r1.s1', 'centre.r1.s3']))).toEqual({
      code: 'adjacent',
      keys: ['centre.r1.s1', 'centre.r1.s3'],
    });
  });

  it('reports seats that are in one row but in different sections', () => {
    expect(selectionRules.adjacent()(ctx(['left.r1.s3', 'centre.r1.s1']))).toMatchObject({
      code: 'adjacent',
    });
  });

  it('reports an unknown key', () => {
    expect(selectionRules.adjacent()(ctx(['centre.r1.s1', 'nowhere.r1.s1']))).toMatchObject({
      code: 'adjacent',
    });
  });

  it('is silent for one contiguous run, a single seat or no seats', () => {
    expect(
      selectionRules.adjacent()(ctx(['centre.r1.s2', 'centre.r1.s3', 'centre.r1.s4'])),
    ).toBeNull();
    expect(selectionRules.adjacent()(ctx(['centre.r1.s5']))).toBeNull();
    expect(selectionRules.adjacent()(ctx([]))).toBeNull();
  });
});

describe('selectionRules.noSingleGap', () => {
  const rule: SelectionRule = selectionRules.noSingleGap();

  it('reports a free seat left between two selected seats', () => {
    expect(rule(ctx(['centre.r1.s1', 'centre.r1.s3']))).toEqual({
      code: 'noSingleGap',
      keys: ['centre.r1.s2'],
    });
  });

  it('counts a blocked neighbour as filled', () => {
    const occupancy: Occupancy = { revision: 1, blocked: ['centre.r1.s4'] };
    expect(rule(ctx(['centre.r1.s6'], occupancy))).toEqual({
      code: 'noSingleGap',
      keys: ['centre.r1.s5'],
    });
  });

  it('is silent when the gap seat is not available', () => {
    const occupancy: Occupancy = { revision: 1, taken: ['centre.r1.s2'] };
    expect(rule(ctx(['centre.r1.s1', 'centre.r1.s3'], occupancy))).toBeNull();
  });

  it('is silent for two adjacent seats and for an aisle or section edge', () => {
    expect(rule(ctx(['centre.r1.s1', 'centre.r1.s2']))).toBeNull();
    expect(rule(ctx(['centre.r1.s1']))).toBeNull();
    expect(rule(ctx(['left.r1.s3']))).toBeNull();
  });

  it('is silent when the other side of the gap is free', () => {
    expect(rule(ctx(['centre.r1.s1']))).toBeNull();
    expect(rule(ctx(['centre.r1.s3']))).toBeNull();
  });
});

describe('validateSelection', () => {
  const rules = [selectionRules.max(1), selectionRules.sameRow()];

  it('reports unknown keys first, then unavailable seats, then the rules', () => {
    const occupancy: Occupancy = { revision: 1, taken: ['centre.r1.s1'] };
    const violations = validateSelection(
      layout,
      occupancy,
      ['nowhere.r9.s9', 'centre.r1.s1', 'centre.r2.s1'],
      rules,
    );
    expect(violations.map((v) => v.code)).toEqual(['unknown', 'unavailable', 'max', 'sameRow']);
    expect(violations[1]).toEqual({
      code: 'unavailable',
      keys: ['centre.r1.s1'],
      params: { status: 'taken' },
    });
  });

  it('reports a held seat as unavailable', () => {
    const occupancy: Occupancy = { revision: 1, held: [{ key: 'centre.r1.s1', mine: false }] };
    expect(validateSelection(layout, occupancy, ['centre.r1.s1'], [])).toEqual([
      { code: 'unavailable', keys: ['centre.r1.s1'], params: { status: 'held' } },
    ]);
  });

  it('is empty for a valid selection without occupancy', () => {
    expect(
      validateSelection(
        layout,
        undefined,
        ['centre.r1.s2', 'centre.r1.s3'],
        [selectionRules.adjacent()],
      ),
    ).toEqual([]);
  });

  it('counts a repeated key once', () => {
    expect(
      validateSelection(
        layout,
        undefined,
        ['centre.r1.s1', 'centre.r1.s1'],
        [selectionRules.max(1)],
      ),
    ).toEqual([]);
  });
});
