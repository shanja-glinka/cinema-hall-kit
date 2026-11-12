/**
 * Seat state and booking rules of the mock backend (api.md §4.2 and §8).
 * The rules run here on the server with the same `selectionRules` the picker uses on the client.
 */
import {
  createSeatIndex,
  priceForSeat,
  resolvePricing,
  selectionRules,
  validateSelection,
  type BookResult,
  type Price,
  type Pricing,
  type Occupancy,
  type SeatIndex,
  type SeatKey,
  type SelectionRule,
} from '@cinema-hall/core';
import type { OccupancyResponse, SessionConfigResponse } from '@/lib/shared/types';
import {
  HOLD_TTL_MS,
  sessionPricing,
  findSession,
  findVersion,
  layoutOf,
  pruneExpired,
  seededTaken,
  type Hold,
  type SessionRecord,
} from './store';

const MAX_SEATS = 6;
const SERVER_RULES: SelectionRule[] = [selectionRules.max(MAX_SEATS), selectionRules.noSingleGap()];

export interface BookInput {
  sessionId: string;
  viewerId: string;
  keys: SeatKey[];
  attemptId: string;
  prices: { key: SeatKey; price: Price }[];
  now: number;
}

export function getOccupancyResponse(
  sessionId: string,
  viewerId: string,
  now: number,
): OccupancyResponse | undefined {
  const session = findSession(sessionId);
  if (!session) return undefined;
  const version = findVersion(session.hallVersionId);
  if (!version) return undefined;
  const pricing = sessionPricing(session);
  return {
    occupancy: snapshot(session, viewerId, now),
    // The page compares this with the version it drew and reloads the hall when they differ.
    hallVersionRev: version.rev,
    ...(pricing ? { pricing } : {}),
  };
}

export function getSessionConfig(sessionId: string): SessionConfigResponse | undefined {
  const session = findSession(sessionId);
  const version = session ? findVersion(session.hallVersionId) : undefined;
  if (!version) return undefined;
  return { sessionId, hallVersionRev: version.rev, config: version.config };
}

function snapshot(session: SessionRecord, viewerId: string, now: number): Occupancy {
  pruneExpired(session, now);
  const layout = layoutOf(session.hallVersionId);
  const taken = layout ? [...seededTaken(session, layout)] : [];
  const held = [...new Set(session.holds.values())].flatMap((hold) =>
    hold.keys.map((key) => ({
      key,
      mine: hold.viewerId === viewerId,
      expiresAt: new Date(hold.expiresAt).toISOString(),
    })),
  );
  return {
    revision: session.revision,
    serverNow: new Date(now).toISOString(),
    taken,
    blocked: [],
    held,
  };
}

/**
 * Books a selection as one all-or-nothing hold. Idempotent by `attemptId`: a repeated attempt
 * gets the first result back, without a second hold.
 */
export function bookSeats(input: BookInput): BookResult {
  const session = findSession(input.sessionId);
  if (!session) return { ok: false, reason: 'closed' };
  pruneExpired(session, input.now);
  const attemptKey = `${input.viewerId}|${input.attemptId}`;
  const previous = session.attempts.get(attemptKey);
  if (previous) return previous;
  const result = attempt(session, input);
  session.attempts.set(attemptKey, result);
  return result;
}

function attempt(session: SessionRecord, input: BookInput): BookResult {
  const keys = [...new Set(input.keys)];
  if (keys.length === 0)
    return { ok: false, reason: 'error', message: 'empty_selection', retryable: false };
  const layout = layoutOf(session.hallVersionId);
  if (!layout)
    return { ok: false, reason: 'error', message: 'hall_version_missing', retryable: false };

  const occupancy = snapshot(session, input.viewerId, input.now);
  const violations = validateSelection(layout, occupancy, keys, SERVER_RULES);

  const blockers = violations.filter((v) => v.code === 'unknown' || v.code === 'unavailable');
  if (blockers.length > 0) {
    const status = blockers.find((v) => v.code === 'unavailable')?.params?.status;
    const cause = status === 'taken' ? 'taken' : status === 'held' ? 'held' : 'unavailable';
    return {
      ok: false,
      reason: 'conflict',
      keys: [...new Set(blockers.flatMap((v) => v.keys))],
      cause,
    };
  }
  const firstRuleViolation = violations[0];
  if (firstRuleViolation) {
    return {
      ok: false,
      reason: 'error',
      message: `selection_rule:${firstRuleViolation.code}`,
      retryable: false,
    };
  }

  // Prices: the viewer saw these; the server compares against its own pricing, never trusts them.
  const index = createSeatIndex(layout);
  const pricing = resolvePricing(layout.pricing, sessionPricing(session));
  if (!allPricesMatch(index, pricing, keys, input.prices)) {
    return { ok: false, reason: 'price_changed' };
  }

  const hold: Hold = {
    id: crypto.randomUUID(),
    viewerId: input.viewerId,
    keys,
    expiresAt: input.now + HOLD_TTL_MS,
  };
  for (const key of keys) session.holds.set(key, hold);
  session.revision += 1;
  return {
    ok: true,
    data: { holdId: hold.id },
    hold: { expiresAt: new Date(hold.expiresAt).toISOString() },
    revision: session.revision,
  };
}

function allPricesMatch(
  index: SeatIndex,
  pricing: Pricing | undefined,
  keys: SeatKey[],
  offered: { key: SeatKey; price: Price }[],
): boolean {
  return keys.every((key) => {
    const seat = index.get(key);
    const expected = seat ? priceForSeat(pricing, seat) : null;
    const given = offered.find((entry) => entry.key === key)?.price;
    return expected !== null && given !== undefined && given === expected;
  });
}
