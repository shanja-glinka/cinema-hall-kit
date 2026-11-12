import type { HallLayout, SeatKey } from './layout.js';
import { createSeatIndex } from './seat-index.js';
import {
  createStatusLookup,
  type Occupancy,
  type SelectionRule,
  type SelectionViolation,
} from './session.js';

/** Rule: no more than `n` seats may be selected. Reports `max`, with the limit in `params`. */
const maxRule =
  (n: number): SelectionRule =>
  ({ keys }) =>
    keys.length > n ? { code: 'max', keys: [...keys], params: { max: n } } : null;

/** Rule: all selected seats are in one row. A key that is not in the layout also fails the rule. */
const sameRowRule: () => SelectionRule =
  () =>
  ({ keys, index }) => {
    const rows = new Set<number>();
    for (const key of keys) {
      const seat = index.get(key);
      if (!seat) return { code: 'sameRow', keys: [...keys] };
      rows.add(seat.rowIndex);
    }
    return rows.size > 1 ? { code: 'sameRow', keys: [...keys] } : null;
  };

/**
 * Rule: the selected seats are in one row and form a single unbroken run, each seat next to another
 * selected seat. Reports `adjacent` otherwise.
 */
const adjacentRule: () => SelectionRule = () => (ctx) => {
  const { keys, index } = ctx;
  if (sameRowRule()(ctx) !== null) return { code: 'adjacent', keys: [...keys] };
  const members = new Set(keys);
  const first = keys[0];
  if (first === undefined) return null;
  const reached = new Set<SeatKey>([first]);
  const queue: SeatKey[] = [first];
  while (queue.length > 0) {
    const key = queue.pop()!;
    const { left, right } = index.neighbors(key);
    for (const next of [left, right]) {
      if (next && members.has(next.key) && !reached.has(next.key)) {
        reached.add(next.key);
        queue.push(next.key);
      }
    }
  }
  return reached.size === members.size ? null : { code: 'adjacent', keys: [...keys] };
};

/**
 * A free seat between two filled neighbours (selected, taken, held or blocked) that also touches
 * one of the selected seats leaves a single gap. Aisles and section edges do not count as filled.
 */
const noSingleGapRule: () => SelectionRule = () => {
  return ({ keys, index, status }) => {
    const selected = new Set(keys);
    const filled = (key: SeatKey) => selected.has(key) || status(key) !== 'available';
    for (const key of keys) {
      const { left, right } = index.neighbors(key);
      for (const gap of [left, right]) {
        if (!gap || selected.has(gap.key) || status(gap.key) !== 'available') continue;
        const around = index.neighbors(gap.key);
        if (around.left && around.right && filled(around.left.key) && filled(around.right.key)) {
          return { code: 'noSingleGap', keys: [gap.key] };
        }
      }
    }
    return null;
  };
};

/** Selection rules shared by the UI and the server. */
export const selectionRules: {
  max(n: number): SelectionRule;
  noSingleGap(): SelectionRule;
  sameRow(): SelectionRule;
  adjacent(): SelectionRule;
} = {
  max: maxRule,
  noSingleGap: noSingleGapRule,
  sameRow: sameRowRule,
  adjacent: adjacentRule,
};

/**
 * Runs selection rules. First reports `unknown` keys (not in the layout) and `unavailable` keys
 * (not `available` in the occupancy), then every rule in order. Duplicate keys count once.
 *
 * @example
 * ```ts
 * const violations = validateSelection(layout, occupancy, ['main.r1.s1', 'main.r1.s3'], [
 *   selectionRules.max(4),
 *   selectionRules.noSingleGap(),
 * ]);
 * ```
 */
export function validateSelection(
  layout: HallLayout,
  occupancy: Occupancy | undefined,
  keys: readonly SeatKey[],
  rules: readonly SelectionRule[],
): SelectionViolation[] {
  const index = createSeatIndex(layout);
  const status = createStatusLookup(occupancy);
  const unique = [...new Set(keys)];
  const violations: SelectionViolation[] = [];
  for (const key of unique) {
    if (!index.has(key)) violations.push({ code: 'unknown', keys: [key] });
  }
  for (const key of unique) {
    const current = status(key);
    if (current !== 'available')
      violations.push({ code: 'unavailable', keys: [key], params: { status: current } });
  }
  const context = { keys: unique, layout, index, status };
  for (const rule of rules) {
    const violation = rule(context);
    if (violation) violations.push(violation);
  }
  return violations;
}
