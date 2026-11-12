import { describe, expect, it } from 'vitest';
import { sameSet, toggleSeat } from '../../src/seat-picker/selection.js';

describe('toggleSeat', () => {
  it('single mode replaces the selection and deselects on a second tap', () => {
    const first = toggleSeat([], 'a', { mode: 'single', pickable: true });
    expect(first.selected).toEqual(['a']);
    const second = toggleSeat(first.selected, 'b', { mode: 'single', pickable: true });
    expect(second.selected).toEqual(['b']);
    expect(toggleSeat(second.selected, 'b', { mode: 'single', pickable: true }).selected).toEqual(
      [],
    );
  });

  it('single mode cannot pick a seat that is not pickable (headless select too)', () => {
    const current = ['a'] as const;
    const result = toggleSeat(current, 'x', { mode: 'single', pickable: false });
    expect(result.selected).toBe(current);
    const empty: string[] = [];
    expect(toggleSeat(empty, 'x', { mode: 'single', pickable: false }).selected).toBe(empty);
  });

  it('multiple mode toggles seats and reports the max without adding', () => {
    const options = { mode: 'multiple' as const, max: 2, pickable: true };
    let selected: readonly string[] = [];
    selected = toggleSeat(selected, 'a', options).selected;
    selected = toggleSeat(selected, 'b', options).selected;
    const full = toggleSeat(selected, 'c', options);
    expect(full.selected).toEqual(['a', 'b']);
    expect(full.maxReached).toBe(true);
    expect(toggleSeat(full.selected, 'a', options).selected).toEqual(['b']);
  });

  it('multiple mode does not add an unpickable seat', () => {
    const result = toggleSeat(['a'], 'x', { mode: 'multiple', pickable: false });
    expect(result.selected).toEqual(['a']);
  });

  it('sameSet ignores order', () => {
    expect(sameSet(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameSet(['a'], ['a', 'b'])).toBe(false);
  });
});
