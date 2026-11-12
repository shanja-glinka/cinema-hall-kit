import type { HeldSeat, Occupancy, OccupancyDelta } from './session.js';
import type { SeatKey } from './layout.js';

/**
 * Compares revisions: numbers numerically; strings, and a number mixed with a string, by plain
 * lexical comparison of their `String()` forms (no locale or numeric collation). Positive when a > b.
 */
export function compareRevisions(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const left = String(a);
  const right = String(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Applies a delta; a delta with a lower revision than `prev` returns `prev` unchanged. */
export function applyOccupancyDelta(prev: Occupancy, delta: OccupancyDelta): Occupancy {
  if (compareRevisions(delta.revision, prev.revision) < 0) return prev;
  const taken = new Set<SeatKey>(prev.taken ?? []);
  const blocked = new Set<SeatKey>(prev.blocked ?? []);
  const held = new Map<SeatKey, HeldSeat>((prev.held ?? []).map((seat) => [seat.key, seat]));
  for (const change of delta.changes) {
    const { key } = change;
    taken.delete(key);
    blocked.delete(key);
    held.delete(key);
    if (change.status === 'taken') taken.add(key);
    else if (change.status === 'blocked') blocked.add(key);
    else if (change.status === 'held') {
      held.set(key, {
        key,
        ...(change.mine !== undefined ? { mine: change.mine } : {}),
        ...(change.expiresAt !== undefined ? { expiresAt: change.expiresAt } : {}),
      });
    }
  }
  return {
    revision: delta.revision,
    ...(delta.serverNow !== undefined ? { serverNow: delta.serverNow } : {}),
    taken: [...taken],
    blocked: [...blocked],
    held: [...held.values()],
  };
}
