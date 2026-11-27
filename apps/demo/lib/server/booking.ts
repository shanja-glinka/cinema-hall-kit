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
  type HallLayout,
  type SelectionRule,
} from '@cinema-hall/core';
import { SELECTION_RULE_PREFIX } from '@/lib/shared/texts';
import type {
  OccupancyResponse,
  OwnHold,
  OwnTicket,
  PurchaseResult,
  SessionConfigResponse,
  Ticket,
} from '@/lib/shared/types';
import {
  HOLD_TTL_MS,
  sessionPricing,
  findSession,
  findVersion,
  layoutOf,
  liveKeys,
  pruneExpired,
  takenSeats,
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
  const occupancy = snapshot(session, viewerId, now);
  const ownHolds = holdsOf(session, viewerId);
  const ownTickets = ticketsOf(session, viewerId);
  return {
    occupancy,
    // The page compares this with the version it drew and reloads the hall when they differ.
    hallVersionRev: version.rev,
    ...(pricing ? { pricing } : {}),
    ...(ownHolds.length > 0 ? { ownHolds } : {}),
    ...(ownTickets.length > 0 ? { ownTickets } : {}),
  };
}

/**
 * The tickets the viewer bought in a session, latest first, with the hold each was bought through.
 * Only the viewer's own. The booking page shows its ticket from here, so it needs to remember
 * nothing about a purchase whose answer did not arrive.
 */
function ticketsOf(session: SessionRecord, viewerId: string): OwnTicket[] {
  return [...session.tickets.entries()]
    .filter(([, done]) => done.viewerId === viewerId)
    .map(([holdId, done]) => ({ holdId, ticket: withCurrentLabels(session, done.ticket) }))
    .sort((a, b) => Date.parse(b.ticket.purchasedAt) - Date.parse(a.ticket.purchasedAt));
}

// A version's layout never changes once built, so its seat index is built once and kept with it.
const seatIndexes = new WeakMap<HallLayout, SeatIndex>();

/**
 * The seat index of a layout, built on first use and then reused: every occupancy answer relabels
 * the viewer's tickets, and the layout is the same between answers.
 * @param layout A hall version's layout.
 */
export function seatIndexOf(layout: HallLayout): SeatIndex {
  let index = seatIndexes.get(layout);
  if (!index) {
    index = createSeatIndex(layout);
    seatIndexes.set(layout, index);
  }
  return index;
}

/**
 * A ticket with the seat labels of the hall version the session is pinned to now. A showtime can be
 * moved to a version that names the same seats differently (rows `A`, `B` become `1`, `2`); the
 * ticket then names its seats the way the seat map does. A seat the version does not know keeps
 * the label it was sold with.
 */
function withCurrentLabels(session: SessionRecord, ticket: Ticket): Ticket {
  const layout = layoutOf(session.hallVersionId);
  if (!layout) return ticket;
  const index = seatIndexOf(layout);
  const seats = ticket.keys.map((key, i) => index.get(key)?.label ?? ticket.seats[i] ?? key);
  return seats.every((label, i) => label === ticket.seats[i]) ? ticket : { ...ticket, seats };
}

/**
 * The viewer's active holds in a session (expired ones are pruned by `snapshot` first), latest
 * first. Only the viewer's own: the id lets that viewer, and nobody else, complete the purchase.
 */
function holdsOf(session: SessionRecord, viewerId: string): OwnHold[] {
  return [...new Set(session.holds.values())]
    .filter((hold) => hold.viewerId === viewerId)
    .sort((a, b) => b.expiresAt - a.expiresAt)
    .map((hold) => ({
      holdId: hold.id,
      keys: liveKeys(session, hold),
      expiresAt: new Date(hold.expiresAt).toISOString(),
    }));
}

export function getSessionConfig(sessionId: string): SessionConfigResponse | undefined {
  const session = findSession(sessionId);
  const version = session ? findVersion(session.hallVersionId) : undefined;
  if (!version) return undefined;
  return { sessionId, hallVersionRev: version.rev, config: version.config };
}

function snapshot(session: SessionRecord, viewerId: string, now: number): Occupancy {
  pruneExpired(session, now);
  const taken = [...takenSeats(session, layoutOf(session.hallVersionId))];
  const held = [...new Set(session.holds.values())].flatMap((hold) =>
    liveKeys(session, hold).map((key) => ({
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
      message: `${SELECTION_RULE_PREFIX}${firstRuleViolation.code}`,
      retryable: false,
    };
  }

  // Prices: the viewer saw these; the server compares against its own pricing, never trusts them.
  const index = seatIndexOf(layout);
  const pricing = resolvePricing(layout.pricing, sessionPricing(session));
  if (!allPricesMatch(index, pricing, keys, input.prices)) {
    return { ok: false, reason: 'price_changed' };
  }

  const hold: Hold = {
    id: crypto.randomUUID(),
    viewerId: input.viewerId,
    keys,
    expiresAt: input.now + HOLD_TTL_MS,
    // The prices the viewer accepted (checked equal to the server's above).
    prices: Object.fromEntries(
      keys.flatMap((key) => {
        const seat = index.get(key);
        const price = seat ? priceForSeat(pricing, seat) : null;
        return price === null ? [] : [[key, price] as const];
      }),
    ),
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

export interface PurchaseInput {
  sessionId: string;
  viewerId: string;
  holdId: string;
  /**
   * The seats to buy: the selection the viewer confirmed, all of them in the hold. The other seats of
   * the hold are released. Omitted: the whole hold is bought.
   */
  keys?: readonly SeatKey[];
  /**
   * The price of each seat as the viewer saw it on the confirm button. When it differs from the
   * current price, nothing is sold (`price_changed`). Omitted: the prices the hold was made at.
   */
  prices?: readonly { key: SeatKey; price: Price }[];
  now: number;
}

/**
 * The demo purchase: turns the viewer's active hold into sold seats and returns a ticket. No
 * payment is taken. Only the confirmed `keys` are sold (they must all be in the hold); the rest of
 * the hold is released, so the price charged is the price of the confirmed seats. Idempotent by hold
 * id: a repeated call for a hold that was already bought returns the same ticket. An expired hold, a
 * hold of another viewer, or seats that are not in the hold (`not_found`), are refused.
 */
export function purchaseHold(input: PurchaseInput): PurchaseResult {
  const session = findSession(input.sessionId);
  if (!session) {
    return { ok: false, reason: 'closed', message: 'This showtime does not exist any more.' };
  }
  return purchaseInSession(
    session,
    input.viewerId,
    input.holdId,
    input.now,
    input.keys,
    input.prices,
  );
}

/**
 * The purchase on one session record, without the store lookup (so it can be tested on its own).
 * @param session The session; changed in place when the purchase goes through.
 * @param viewerId Who asks: only the viewer who holds the seats can buy them.
 * @param holdId The hold to buy.
 * @param now Epoch milliseconds.
 * @param keys The confirmed seats, all in the hold; the rest of the hold is released. Omitted: all.
 * @param quoted The price of each confirmed seat as the viewer saw it. Omitted: the prices the hold
 * was made at. When a current price differs, nothing is sold (`price_changed`, with the new total).
 * @returns The ticket, or why there is none.
 */
export function purchaseInSession(
  session: SessionRecord,
  viewerId: string,
  holdId: string,
  now: number,
  keys?: readonly SeatKey[],
  quoted?: readonly { key: SeatKey; price: Price }[],
): PurchaseResult {
  const wanted = keys === undefined ? undefined : [...new Set(keys)];
  if (wanted !== undefined && wanted.length === 0) return notInHold();
  const done = session.tickets.get(holdId);
  if (done) {
    if (done.viewerId !== viewerId) return notFound();
    // A repeat of the same purchase gets the same ticket; other seats were never bought with it.
    if (wanted !== undefined && !sameSeats(wanted, done.ticket.keys)) return notInHold();
    return { ok: true, ticket: withCurrentLabels(session, done.ticket) };
  }
  // Looked up before the expired holds are dropped, so an expired hold is named as such.
  const hold = [...new Set(session.holds.values())].find((candidate) => candidate.id === holdId);
  if (!hold || hold.viewerId !== viewerId) {
    pruneExpired(session, now);
    return notFound();
  }
  if (hold.expiresAt <= now) {
    pruneExpired(session, now);
    return {
      ok: false,
      reason: 'expired',
      message:
        'The 10 minutes to confirm have run out and the seats were released. Choose them again.',
    };
  }
  // Only the seats the hold still covers can be sold through it: a newer reservation may have taken
  // some of them over (and sold them), so `hold.keys` is not trusted on its own.
  const live = liveKeys(session, hold);
  if (live.length === 0) return notFound();
  if (wanted !== undefined && !wanted.every((key) => live.includes(key))) return notInHold();
  // In the order of the hold, so the ticket lists the seats as they were reserved.
  const bought = wanted === undefined ? live : live.filter((key) => wanted.includes(key));
  const layout = layoutOf(session.hallVersionId);
  // A smaller selection frees the rest of the hold, so it has to follow the same selection rules
  // as a reservation does, against the seats as they are once that rest is released.
  if (layout && bought.length < live.length) {
    const broken = firstBrokenRule(session, layout, hold, bought, now);
    if (broken) return broken;
  }
  const index = layout ? seatIndexOf(layout) : undefined;
  const pricing = layout ? resolvePricing(layout.pricing, sessionPricing(session)) : undefined;
  let total: Price | null = 0;
  const seats: string[] = [];
  let changed = false;
  for (const key of bought) {
    const seat = index?.get(key);
    seats.push(seat?.label ?? key);
    const price = seat ? priceForSeat(pricing, seat) : null;
    total = total === null || price === null ? null : Math.round((total + price) * 100) / 100;
    // The confirmation is bound to the price the viewer saw: the quote sent with it, or else the
    // price the seat was reserved at. A seat with no quote at all (an old hold) is not compared.
    const seen = quoted ? quoted.find((entry) => entry.key === key)?.price : hold.prices?.[key];
    if (quoted ? seen !== price : seen !== undefined && seen !== price) changed = true;
  }
  if (changed) {
    return {
      ok: false,
      reason: 'price_changed',
      total,
      message: 'The price of these seats has changed. Check the new total and confirm again.',
    };
  }
  const ticket: Ticket = {
    number: `T-${hold.id.replaceAll('-', '').slice(0, 8).toUpperCase()}`,
    sessionId: session.id,
    keys: bought,
    seats,
    total,
    purchasedAt: new Date(now).toISOString(),
  };
  // The seats of the hold that were not confirmed are released; the confirmed ones are sold.
  for (const key of hold.keys) {
    if (session.holds.get(key) === hold) session.holds.delete(key);
  }
  for (const key of bought) session.sold.set(key, ticket.number);
  session.tickets.set(hold.id, { viewerId, ticket });
  session.revision += 1;
  return { ok: true, ticket };
}

/**
 * Runs the server's selection rules on the seats to buy, with the occupancy that results after the
 * rest of the hold is released: the sold and the other viewers' held seats stay, the hold itself
 * does not. A refusal sells nothing and releases nothing; the viewer's hold stays as it was.
 * @returns The refusal (`selection_rule` with the broken rule's code), or `undefined` when the
 * seats may be bought.
 */
function firstBrokenRule(
  session: SessionRecord,
  layout: HallLayout,
  hold: Hold,
  bought: readonly SeatKey[],
  now: number,
): PurchaseResult | undefined {
  pruneExpired(session, now);
  const after: Occupancy = {
    revision: session.revision,
    serverNow: new Date(now).toISOString(),
    taken: [...takenSeats(session, layout)],
    blocked: [],
    held: [...new Set(session.holds.values())]
      .filter((other) => other !== hold)
      .flatMap((other) =>
        liveKeys(session, other).map((key) => ({
          key,
          mine: false,
          expiresAt: new Date(other.expiresAt).toISOString(),
        })),
      ),
  };
  const violation = validateSelection(layout, after, bought, SERVER_RULES)[0];
  if (!violation) return undefined;
  return {
    ok: false,
    reason: 'selection_rule',
    rule: violation.code,
    message: `Buying only these seats would break the "${violation.code}" seating rule. Nothing was bought.`,
  };
}

function notInHold(): PurchaseResult {
  return {
    ok: false,
    reason: 'not_found',
    message: 'Some of these seats are not reserved for you. Choose them again.',
  };
}

function sameSeats(a: readonly SeatKey[], b: readonly SeatKey[]): boolean {
  return a.length === b.length && a.every((key) => b.includes(key));
}

function notFound(): PurchaseResult {
  return {
    ok: false,
    reason: 'not_found',
    message: 'These seats are no longer held for you. Choose them again.',
  };
}
