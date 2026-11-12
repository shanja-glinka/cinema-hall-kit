import { describe, expect, it } from 'vitest';
import { applyOccupancyDelta, compareRevisions } from '../src/occupancy.js';
import type { Occupancy } from '../src/session.js';

describe('compareRevisions', () => {
  it('compares numbers numerically', () => {
    expect(compareRevisions(2, 10)).toBeLessThan(0);
    expect(compareRevisions(10, 9)).toBeGreaterThan(0);
    expect(compareRevisions(4, 4)).toBe(0);
  });

  it('compares strings by plain code units, not by numeric or locale collation', () => {
    expect(compareRevisions('rev10', 'rev9')).toBeLessThan(0);
    expect(compareRevisions('a', 'a')).toBe(0);
    expect(compareRevisions('a', 'B')).toBeGreaterThan(0);
  });

  it('compares a number with a string as their string forms', () => {
    expect(compareRevisions('10', 9)).toBeLessThan(0);
    expect(compareRevisions(9, '10')).toBeGreaterThan(0);
  });

  it('ignores a delta whose string revision is lexically lower', () => {
    const before: Occupancy = { revision: 'rev9', taken: [] };
    const delta = { revision: 'rev10', changes: [{ key: 'a.r1.s1', status: 'taken' as const }] };
    expect(applyOccupancyDelta(before, delta)).toBe(before);
  });
});

describe('applyOccupancyDelta', () => {
  const prev: Occupancy = {
    revision: 5,
    taken: ['a.r1.s1'],
    blocked: ['a.r1.s2'],
    held: [{ key: 'a.r1.s3' }],
  };

  it('ignores a delta with a lower revision', () => {
    expect(
      applyOccupancyDelta(prev, {
        revision: 4,
        changes: [{ key: 'a.r1.s1', status: 'available' }],
      }),
    ).toBe(prev);
  });

  it('moves seats between lists and removes available ones everywhere', () => {
    const next = applyOccupancyDelta(prev, {
      revision: 6,
      serverNow: '2026-11-09T10:00:00Z',
      changes: [
        { key: 'a.r1.s1', status: 'available' },
        { key: 'a.r1.s2', status: 'taken' },
        { key: 'a.r1.s3', status: 'blocked' },
        { status: 'held', key: 'a.r1.s4', mine: true, expiresAt: '2026-11-09T10:05:00Z' },
      ],
    });
    expect(next).toEqual({
      revision: 6,
      serverNow: '2026-11-09T10:00:00Z',
      taken: ['a.r1.s2'],
      blocked: ['a.r1.s3'],
      held: [{ key: 'a.r1.s4', mine: true, expiresAt: '2026-11-09T10:05:00Z' }],
    });
  });

  it('applies a delta with the same revision and keeps no serverNow when the delta has none', () => {
    const next = applyOccupancyDelta(prev, {
      revision: 5,
      changes: [{ key: 'a.r1.s9', status: 'taken' }],
    });
    expect(next).toEqual({
      revision: 5,
      taken: ['a.r1.s1', 'a.r1.s9'],
      blocked: ['a.r1.s2'],
      held: [{ key: 'a.r1.s3' }],
    });
    expect(next).not.toHaveProperty('serverNow');
  });

  it('turns a held seat into a plain hold without optional fields', () => {
    const next = applyOccupancyDelta(prev, {
      revision: 7,
      changes: [{ status: 'held', key: 'a.r1.s1' }],
    });
    expect(next.held).toEqual([{ key: 'a.r1.s3' }, { key: 'a.r1.s1' }]);
    expect(next.taken).toEqual([]);
  });

  it('starts from an empty occupancy', () => {
    const next = applyOccupancyDelta(
      { revision: 0 },
      { revision: '1', changes: [{ key: 'a.r1.s1', status: 'taken' }] },
    );
    expect(next).toEqual({ revision: '1', taken: ['a.r1.s1'], blocked: [], held: [] });
  });
});
