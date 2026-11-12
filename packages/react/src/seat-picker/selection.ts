import type { SeatKey } from '@cinema-hall/core';

/** Options of one selection step (`toggleSeat`). */
export interface ToggleOptions {
  mode: 'single' | 'multiple';
  max?: number;
  /** The seat can be taken right now (available, and not held or taken by someone else). */
  pickable: boolean;
}

/** Outcome of one selection step (`toggleSeat`). */
export interface ToggleResult {
  /** The same array instance when nothing changed. */
  selected: readonly SeatKey[];
  /** A multiple selection is full, so the seat was not added. */
  maxReached: boolean;
}

/**
 * Pure selection step for one tap. Only a pickable seat can be added, in both modes; a selected
 * seat can always be removed.
 * @param selected - Current selection.
 * @param key - The tapped seat.
 * @param options - Mode, the `max` of multiple mode and whether the seat is pickable now.
 * @returns The next selection (the same array when nothing changed) and whether `max` blocked the add.
 */
export function toggleSeat(
  selected: readonly SeatKey[],
  key: SeatKey,
  options: ToggleOptions,
): ToggleResult {
  const isSelected = selected.includes(key);
  if (options.mode === 'single') {
    if (isSelected) return { selected: [], maxReached: false };
    if (!options.pickable) return { selected, maxReached: false };
    return { selected: [key], maxReached: false };
  }
  if (isSelected) return { selected: selected.filter((item) => item !== key), maxReached: false };
  if (!options.pickable) return { selected, maxReached: false };
  if (options.max !== undefined && selected.length >= options.max) {
    return { selected, maxReached: true };
  }
  return { selected: [...selected, key], maxReached: false };
}

/**
 * Removes duplicate keys, keeping the first occurrence.
 * @param keys - Seat keys, possibly with duplicates.
 * @returns A new array of unique keys.
 */
export function uniqueKeys(keys: readonly SeatKey[]): SeatKey[] {
  return [...new Set(keys)];
}

/**
 * Same keys in the same order.
 * @param a - First list.
 * @param b - Second list.
 * @returns `true` when both lists are equal element by element.
 */
export function sameKeys(a: readonly SeatKey[], b: readonly SeatKey[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

/**
 * Same keys, in any order.
 * @param a - First list.
 * @param b - Second list.
 * @returns `true` when both lists hold the same keys.
 */
export function sameSet(a: readonly SeatKey[], b: readonly SeatKey[]): boolean {
  return a.length === b.length && a.every((key) => b.includes(key));
}

/**
 * Unique keys in layout order; unknown keys remain (sorted, after the known ones) so base-rule
 * validation can still report them.
 * @param keys - Any selection, e.g. a controlled `value` with duplicates.
 * @param order - Every seat key of the layout, in layout order.
 * @returns The canonical selection used for rendering, totals, validation and booking.
 */
export function canonicalKeys(keys: readonly SeatKey[], order: readonly SeatKey[]): SeatKey[] {
  const wanted = new Set(keys);
  const known = order.filter((key) => wanted.delete(key));
  return [...known, ...[...wanted].sort()];
}
