/** Reservations, purchases and tickets of the demo backend and its shared helpers: no browser, no server. */
import { expect, test } from '@playwright/test';
import {
  parseHallConfig,
  buildHallLayout,
  createSeatIndex,
  type BookResult,
} from '@cinema-hall/core';
import {
  bookSeats,
  getOccupancyResponse,
  purchaseInSession,
  seatIndexOf,
} from '../lib/server/booking';
import { createHall } from '../lib/server/halls';
import {
  db,
  makeSession,
  type Hold,
  type SessionRecord,
  layoutOf,
  makeVersion,
} from '../lib/server/store';
import {
  type OwnHold,
  type OwnTicket,
  type Ticket,
  isOccupancyResponse,
  isPurchaseResult,
  isRepinResponse,
} from '../lib/shared/types';
import {
  seatsInOwnHolds,
  holdForPurchase,
  bookingPanel,
  sendPurchase,
  holdIdFor,
  quotePrices,
  restorableHold,
  unpricedSeats,
  seatsToBuy,
} from '../lib/shared/own-hold';
import { bookingLayout } from '../lib/shared/booking-layout';
import { repinHall } from '../lib/server/sessions';
import { movableCount } from '../lib/shared/repin';
import { t, SELECTION_RULE_PREFIX } from '../lib/shared/texts';
import { labels } from '@cinema-hall/react';
import { explainRefusal } from '../lib/shared/selection-refusal';

const NOW = Date.now();

const unique = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const configOf = (version: string): Record<string, unknown> => {
  const text = db().versions.get(version)?.source;
  if (!text) throw new Error(`no sample hall ${version}`);
  const parsed = parseHallConfig(text, { format: 'yaml' });
  if (!parsed.ok) throw new Error('not a valid hall');
  return parsed.config as unknown as Record<string, unknown>;
};

const ticketOf = (holdId: string, number: string): OwnTicket => ({
  holdId,
  ticket: {
    number,
    seats: ['A1'],
    keys: ['a'],
    sessionId: 's1',
    total: 1,
    purchasedAt: '',
  } as Ticket,
});

const kamerny = (): string => {
  const source = db().versions.get('kamerny-hall@1')?.source;
  if (!source) throw new Error('no sample hall');
  return source;
};

test.describe('a seat taken over by a newer reservation is never sold twice', () => {
  function freshSession(): SessionRecord {
    const hall = db().halls.get('kamerny-hall');
    if (!hall) throw new Error('no hall');
    const session = makeSession(hall, {
      id: unique('takeover-hall'),
      date: '2099-01-01',
      time: '12:00',
      format: '2D',
      occupancyPercent: 0,
    });
    db().sessions.set(session.id, session);
    return session;
  }

  /**
   * A newer hold of the same viewer that takes over some seats of an older one. `bookSeats` refuses
   * an overlap today (the viewer's own held seats count as held), but the seat map allows it
   * (`session.holds` maps each seat to one hold), so the purchase must not rely on that refusal.
   */
  function takeOver(session: SessionRecord, keys: string[]): string {
    const hold: Hold = {
      id: crypto.randomUUID(),
      viewerId: 'viewer-a',
      keys,
      expiresAt: NOW + 10 * 60_000 + 10,
      prices: Object.fromEntries(keys.map((key) => [key, 350])),
    };
    for (const key of keys) session.holds.set(key, hold);
    session.revision += 1;
    return hold.id;
  }

  function hold(session: SessionRecord, keys: string[], now = NOW): string {
    const result = bookSeats({
      sessionId: session.id,
      viewerId: 'viewer-a',
      keys,
      attemptId: unique('a'),
      prices: keys.map((key) => ({ key, price: 350 })),
      now,
    });
    if (!result.ok) throw new Error(JSON.stringify(result));
    return (result.data as { holdId: string }).holdId;
  }

  test('booking a seat of the own active hold again is refused, as before', () => {
    const session = freshSession();
    hold(session, ['main.r1.s1', 'main.r1.s2']);
    const again = bookSeats({
      sessionId: session.id,
      viewerId: 'viewer-a',
      keys: ['main.r1.s2', 'main.r1.s3'],
      attemptId: unique('a'),
      prices: [
        { key: 'main.r1.s2', price: 350 },
        { key: 'main.r1.s3', price: 350 },
      ],
      now: NOW + 10,
    });
    expect(again).toMatchObject({ ok: false, reason: 'conflict', cause: 'held' });
  });

  test('the older hold cannot sell a seat the newer hold already sold', () => {
    const session = freshSession();
    const older = hold(session, ['main.r1.s1', 'main.r1.s2']);
    // The same viewer reserves again, overlapping: seat 2 now belongs to the newer hold.
    const newer = takeOver(session, ['main.r1.s2', 'main.r1.s3']);
    const sold = purchaseInSession(session, 'viewer-a', newer, NOW + 1000);
    expect(sold).toMatchObject({ ok: true, ticket: { keys: ['main.r1.s2', 'main.r1.s3'] } });

    // Asking the older hold for seat 2 is refused, and nothing is sold.
    expect(
      purchaseInSession(session, 'viewer-a', older, NOW + 2000, ['main.r1.s1', 'main.r1.s2']),
    ).toMatchObject({ ok: false, reason: 'not_found' });
    // The whole older hold is now only seat 1: the ticket lists that seat and no other.
    const rest = purchaseInSession(session, 'viewer-a', older, NOW + 3000);
    expect(rest).toMatchObject({ ok: true, ticket: { keys: ['main.r1.s1'] } });
    const tickets = [...session.tickets.values()].flatMap((entry) => entry.ticket.keys);
    expect(tickets.filter((key) => key === 'main.r1.s2')).toHaveLength(1);
    expect(session.sold.get('main.r1.s2')).toBe(sold.ok ? sold.ticket.number : 'the newer ticket');
  });

  test('the viewer is told only the seats each hold still covers', () => {
    const session = freshSession();
    const older = hold(session, ['main.r1.s1', 'main.r1.s2']);
    const newer = takeOver(session, ['main.r1.s2', 'main.r1.s3']);
    const answer = getOccupancyResponse(session.id, 'viewer-a', NOW + 1000);
    const byId = new Map(answer?.ownHolds?.map((own) => [own.holdId, own.keys]));
    expect(byId.get(older)).toEqual(['main.r1.s1']);
    expect(byId.get(newer)).toEqual(['main.r1.s2', 'main.r1.s3']);
    // Each held seat is reported once.
    const held = answer?.occupancy.held?.map((entry) => entry.key) ?? [];
    expect(new Set(held).size).toBe(held.length);
    expect(held.sort()).toEqual(['main.r1.s1', 'main.r1.s2', 'main.r1.s3']);
  });

  test('a hold whose seats were all taken over sells nothing', () => {
    const session = freshSession();
    const older = hold(session, ['main.r1.s2']);
    const newer = takeOver(session, ['main.r1.s2', 'main.r1.s3']);
    expect(purchaseInSession(session, 'viewer-a', newer, NOW + 1000).ok).toBe(true);
    expect(purchaseInSession(session, 'viewer-a', older, NOW + 2000)).toMatchObject({
      ok: false,
      reason: 'not_found',
    });
  });
});

test.describe('booking: seats of a reservation the viewer already has', () => {
  const now = Date.parse('2026-01-01T12:00:00Z');
  const holds: OwnHold[] = [
    { holdId: 'h1', keys: ['a', 'b'], expiresAt: '2026-01-01T12:05:00Z' },
    { holdId: 'old', keys: ['c'], expiresAt: '2026-01-01T11:59:00Z' },
  ];
  test('lists the selected seats that an active own reservation holds', () => {
    expect(seatsInOwnHolds(['a', 'x'], holds, now)).toEqual(['a']);
    expect(seatsInOwnHolds(['x', 'y'], holds, now)).toEqual([]);
  });
  test('an expired reservation holds nothing', () => {
    expect(seatsInOwnHolds(['c', 'x'], holds, now)).toEqual([]);
    expect(seatsInOwnHolds(['a'], undefined, now)).toEqual([]);
  });
});

test.describe('a purchase goes through one reservation that covers the selection', () => {
  function freshSession(): SessionRecord {
    const hall = db().halls.get('kamerny-hall');
    if (!hall) throw new Error('no hall');
    const session = makeSession(hall, {
      id: unique('one-hold-hall'),
      date: '2099-01-01',
      time: '12:00',
      format: '2D',
      occupancyPercent: 0,
    });
    db().sessions.set(session.id, session);
    return session;
  }

  function hold(session: SessionRecord, keys: string[]): string {
    const result = bookSeats({
      sessionId: session.id,
      viewerId: 'viewer-a',
      keys,
      attemptId: unique('a'),
      prices: keys.map((key) => ({ key, price: 350 })),
      now: NOW,
    });
    if (!result.ok) throw new Error(JSON.stringify(result));
    return (result.data as { holdId: string }).holdId;
  }

  test('a selection spread over two reservations is reported, not sent with one of them', () => {
    const session = freshSession();
    // Reserve seat 1, deselect it, reserve seat 2, select seat 1 again: both are the viewer's.
    const first = hold(session, ['main.r1.s1']);
    const second = hold(session, ['main.r1.s2']);
    const own = getOccupancyResponse(session.id, 'viewer-a', NOW + 10)?.ownHolds;
    const keys = ['main.r1.s1', 'main.r1.s2'];

    // What the page sent before: the latest reservation with both seats. The server refuses it.
    expect(purchaseInSession(session, 'viewer-a', second, NOW + 20, keys)).toMatchObject({
      ok: false,
      reason: 'not_found',
    });
    // Now the page sees that no single reservation covers them and says so instead.
    expect(holdForPurchase(keys, own, second)).toEqual({ kind: 'split' });

    // Each reservation on its own can still be bought.
    expect(holdForPurchase(['main.r1.s2'], own, second)).toEqual({ kind: 'hold', holdId: second });
    expect(holdForPurchase(['main.r1.s1'], own, second)).toEqual({ kind: 'hold', holdId: first });
    expect(purchaseInSession(session, 'viewer-a', first, NOW + 30, ['main.r1.s1'])).toMatchObject({
      ok: true,
    });
  });

  test('the known reservation is used while the occupancy answer has not caught up', () => {
    expect(holdForPurchase(['a', 'b'], undefined, 'h1')).toEqual({ kind: 'hold', holdId: 'h1' });
    expect(
      holdForPurchase(['a', 'b'], [{ holdId: 'h0', keys: ['a'], expiresAt: '' }], 'h1'),
    ).toEqual({ kind: 'hold', holdId: 'h1' });
    expect(holdForPurchase(['a'], undefined, undefined)).toEqual({ kind: 'none' });
    expect(holdForPurchase([], [], 'h1')).toEqual({ kind: 'none' });
    // A restored reservation (none known on the page) is found among the viewer's own.
    expect(
      holdForPurchase(
        ['a', 'b'],
        [{ holdId: 'h2', keys: ['a', 'b', 'c'], expiresAt: '' }],
        undefined,
      ),
    ).toEqual({ kind: 'hold', holdId: 'h2' });
  });
});

test.describe('a purchase is never bought twice or lost', () => {
  test('a purchase without an answer is sent again, and stops at the first answer', async () => {
    let calls = 0;
    const answer = await sendPurchase(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('offline');
        return 'ticket';
      },
      3,
      async () => undefined,
    );
    expect(answer).toBe('ticket');
    expect(calls).toBe(3);
  });

  test('no answer at all is reported as unknown (null), after the last attempt', async () => {
    let calls = 0;
    const waits: number[] = [];
    const answer = await sendPurchase(
      async () => {
        calls += 1;
        throw new Error('offline');
      },
      3,
      async (retry) => void waits.push(retry),
    );
    expect(answer).toBeNull();
    expect(calls).toBe(3);
    expect(waits).toEqual([1, 2]);
  });

  test('a refusal is an answer: it is not sent again', async () => {
    let calls = 0;
    const answer = await sendPurchase(async () => {
      calls += 1;
      return { ok: false };
    });
    expect(answer).toEqual({ ok: false });
    expect(calls).toBe(1);
  });

  test('the reservation on the page turns into its ticket however the ticket arrived', () => {
    const hold = { holdId: 'h1', expiresAt: '2099-01-01T00:00:00Z' };
    expect(bookingPanel(hold, [], new Set())).toEqual({ kind: 'hold', ...hold });
    // The purchase answer was lost; the occupancy answer lists the ticket of this reservation.
    expect(bookingPanel(hold, [ticketOf('h0', 'T-0'), ticketOf('h1', 'T-1')], new Set())).toEqual({
      kind: 'ticket',
      holdId: 'h1',
      ticket: ticketOf('h1', 'T-1').ticket,
    });
    // An older ticket does not hide the reservation that is still open.
    expect(bookingPanel(hold, [ticketOf('h0', 'T-0')], new Set())?.kind).toBe('hold');
  });

  test('without a reservation the latest ticket is shown until it is closed', () => {
    const tickets = [ticketOf('h2', 'T-2'), ticketOf('h1', 'T-1')];
    expect(bookingPanel(null, tickets, new Set())).toMatchObject({ kind: 'ticket', holdId: 'h2' });
    expect(bookingPanel(null, tickets, new Set(['h2', 'h1']))).toBeNull();
    expect(bookingPanel(null, [], new Set())).toBeNull();
  });
});

test.describe('a purchase whose answer was lost is recovered, not lost', () => {
  test('the occupancy answer lists the tickets of its viewer only, and asking buys nothing', () => {
    const hall = db().halls.get('kamerny-hall');
    if (!hall) throw new Error('no hall');
    const session = makeSession(hall, {
      id: unique('lost-answer-hall'),
      date: '2099-01-01',
      time: '12:00',
      format: '2D',
      occupancyPercent: 0,
    });
    db().sessions.set(session.id, session);
    const seat = { key: 'main.r1.s1' };
    const booked = bookSeats({
      sessionId: session.id,
      viewerId: 'viewer-a',
      keys: [seat.key],
      attemptId: unique('attempt'),
      prices: [{ key: seat.key, price: 350 }],
      now: Date.now(),
    });
    expect(booked.ok).toBe(true);
    const holdId = booked.ok ? (booked.data as { holdId: string }).holdId : '';
    // Before the purchase: no tickets, and asking changes nothing.
    expect(getOccupancyResponse(session.id, 'viewer-a', Date.now())?.ownTickets).toBeUndefined();
    expect(session.sold.size).toBe(0);
    const bought = purchaseInSession(session, 'viewer-a', holdId, Date.now(), [seat.key]);
    expect(bought.ok).toBe(true);
    const answer = getOccupancyResponse(session.id, 'viewer-a', Date.now());
    expect(answer?.ownTickets).toEqual([{ holdId, ticket: bought.ok ? bought.ticket : null }]);
    expect(answer && isOccupancyResponse(JSON.parse(JSON.stringify(answer)))).toBe(true);
    expect(getOccupancyResponse(session.id, 'viewer-b', Date.now())?.ownTickets).toBeUndefined();
  });
});

test.describe('the reservation and its price after a reload', () => {
  const NOW = Date.now();

  function freshSession(): SessionRecord {
    const hall = db().halls.get('kamerny-hall');
    if (!hall) throw new Error('no hall');
    const session = makeSession(hall, {
      id: unique('reload-hall'),
      date: '2099-01-01',
      time: '12:00',
      format: '2D',
      occupancyPercent: 0,
    });
    db().sessions.set(session.id, session);
    return session;
  }

  function hold(session: SessionRecord, viewerId: string, keys: string[]): string {
    const result = bookSeats({
      sessionId: session.id,
      viewerId,
      keys,
      attemptId: unique('a'),
      prices: keys.map((key) => ({ key, price: 350 })),
      now: NOW,
    });
    if (!result.ok) throw new Error(JSON.stringify(result));
    return (result.data as { holdId: string }).holdId;
  }

  const tierOf = (session: SessionRecord, key: string): string => {
    const seat = layoutOf(session.hallVersionId)?.seats.find((item) => item.key === key);
    if (!seat) throw new Error('no seat');
    return seat.priceTier;
  };

  test('the occupancy answer gives the viewer, and only them, their own holds', () => {
    const session = freshSession();
    const holdId = hold(session, 'viewer-a', ['main.r1.s1', 'main.r1.s2']);
    hold(session, 'viewer-b', ['main.r2.s5']);
    const mine = getOccupancyResponse(session.id, 'viewer-a', NOW + 1000);
    expect(isOccupancyResponse(mine)).toBe(true);
    expect(mine?.ownHolds).toEqual([
      {
        holdId,
        keys: ['main.r1.s1', 'main.r1.s2'],
        expiresAt: new Date(NOW + 10 * 60_000).toISOString(),
      },
    ]);
    const restored = restorableHold(mine?.ownHolds, NOW + 1000);
    expect(restored?.holdId).toBe(holdId);
    expect(holdIdFor(['main.r1.s2'], mine?.ownHolds)).toBe(holdId);
    expect(holdIdFor(['main.r2.s5'], mine?.ownHolds)).toBeUndefined();
    // Another viewer sees the seats as held but learns no hold id.
    const other = getOccupancyResponse(session.id, 'viewer-c', NOW + 1000);
    expect(other?.ownHolds).toBeUndefined();
    // An expired hold is not restored.
    expect(restorableHold(mine?.ownHolds, NOW + 11 * 60_000)).toBeNull();

    // The restored hold can be bought with the quote the page shows.
    const layout = layoutOf(session.hallVersionId);
    if (!layout) throw new Error('no layout');
    const prices = quotePrices(layout, getOccupancyResponse(session.id, 'viewer-a', NOW)?.pricing, [
      'main.r1.s1',
      'main.r1.s2',
    ]);
    expect(prices).toEqual([
      { key: 'main.r1.s1', price: 350 },
      { key: 'main.r1.s2', price: 350 },
    ]);
    const bought = purchaseInSession(session, 'viewer-a', holdId, NOW + 2000, undefined, prices);
    expect(bought).toMatchObject({ ok: true, ticket: { total: 700 } });
  });

  test('a price that changed after the quote is refused with the new total; nothing is sold', () => {
    const session = freshSession();
    const keys = ['main.r1.s1', 'main.r1.s2'];
    const holdId = hold(session, 'viewer-a', keys);
    const quote = keys.map((key) => ({ key, price: 350 }));
    // The showtime price changes after the viewer saw the confirm button.
    session.pricing = { tiers: { [tierOf(session, 'main.r1.s1')]: 400 } };

    const refused = purchaseInSession(session, 'viewer-a', holdId, NOW + 1000, keys, quote);
    expect(isPurchaseResult(refused)).toBe(true);
    expect(refused).toMatchObject({ ok: false, reason: 'price_changed', total: 800 });
    expect(session.sold.size).toBe(0);
    for (const key of keys) expect(session.holds.get(key)?.id).toBe(holdId);

    // Without a quote of its own the purchase is bound to the price the seats were reserved at.
    expect(purchaseInSession(session, 'viewer-a', holdId, NOW + 1000, keys)).toMatchObject({
      ok: false,
      reason: 'price_changed',
    });
    expect(session.sold.size).toBe(0);

    // Confirmed again at the new price, the purchase goes through and charges it.
    const layout = layoutOf(session.hallVersionId);
    if (!layout) throw new Error('no layout');
    const fresh = quotePrices(layout, session.pricing, keys);
    expect(fresh.map((entry) => entry.price)).toEqual([400, 400]);
    const bought = purchaseInSession(session, 'viewer-a', holdId, NOW + 2000, keys, fresh);
    expect(bought).toMatchObject({ ok: true, ticket: { total: 800 } });
  });

  test('quotePrices reads the hall prices of a built layout', () => {
    const layout = buildHallLayout(parseHallConfig(kamerny(), { strict: true }).config);
    expect(quotePrices(layout, undefined, ['main.r1.s1', 'no.such.seat'])).toEqual([
      { key: 'main.r1.s1', price: 350 },
    ]);
  });
});

test.describe('seats that lost their price', () => {
  const config = () => {
    const parsed = parseHallConfig(kamerny(), { format: 'yaml', strict: true });
    return structuredClone(parsed.config);
  };

  test('unpricedSeats names the selected seats without a price, in order', () => {
    const priced = buildHallLayout(config(), { enforce: true });
    expect(unpricedSeats(priced, undefined, ['main.r1.s1', 'main.r1.s2'])).toEqual([]);
    const noPrices = config();
    delete noPrices.pricing;
    const free = buildHallLayout(noPrices, { enforce: true });
    expect(unpricedSeats(free, undefined, ['main.r1.s2', 'main.r1.s1'])).toEqual([
      'main.r1.s2',
      'main.r1.s1',
    ]);
  });

  test('the explanation names the seats in plain words', () => {
    expect(t.booking.priceUnavailable(['F10'])).toBe(
      'Seat F10 has no price at this showtime, so it cannot be bought. Deselect it to buy the other seats.',
    );
    expect(t.booking.priceUnavailable(['F10', 'F11'])).toContain('Seats F10, F11 have no price');
  });
});

test.describe('the seats still to buy', () => {
  const ticket = (keys: string[]): OwnTicket => ({
    holdId: unique('h'),
    ticket: {
      number: 'T-1',
      sessionId: 's',
      keys,
      seats: keys,
      total: null,
      purchasedAt: new Date().toISOString(),
    },
  });

  test('leave out seats the viewer already bought', () => {
    expect(seatsToBuy(['a', 'b', 'c'], [ticket(['b'])])).toEqual(['a', 'c']);
    expect(seatsToBuy(['a'], [])).toEqual(['a']);
    expect(seatsToBuy(['a', 'b'], [ticket(['a']), ticket(['b'])])).toEqual([]);
  });

  test('a bought seat that lost its price does not count as unpriced', () => {
    const layout = layoutOf('kamerny-hall@1');
    if (!layout) throw new Error('no layout');
    const [boughtSeat, other] = layout.seats;
    if (!boughtSeat || !other) throw new Error('no seats');
    // The showtime moved to a layout without a price for the bought seat's tier.
    const noPrice = {
      ...layout,
      pricing: { ...layout.pricing, tiers: {} },
      seats: layout.seats.map((seat) =>
        seat.key === boughtSeat.key ? { ...seat, priceTier: 'gone' } : seat,
      ),
    };
    const selected = [boughtSeat.key, other.key];
    expect(unpricedSeats(noPrice, undefined, selected)).toContain(boughtSeat.key);
    expect(
      unpricedSeats(noPrice, undefined, seatsToBuy(selected, [ticket([boughtSeat.key])])),
    ).not.toContain(boughtSeat.key);
  });
});

test.describe('a reservation the server refuses for a selection rule', () => {
  const picker = labels.en.picker;

  test('reads as the picker reads the same rule, never as a code', () => {
    const refused = {
      ok: false,
      reason: 'error',
      message: `${SELECTION_RULE_PREFIX}noSingleGap`,
      retryable: false,
    } as const;
    expect(explainRefusal(refused, picker)).toEqual({
      ...refused,
      message: 'Please don’t leave a single empty seat',
    });
    expect(
      explainRefusal({ ...refused, message: `${SELECTION_RULE_PREFIX}max` }, picker, { max: 6 }),
    ).toMatchObject({ message: 'You can select up to 6 seats' });
    // A rule without a text of its own gets the picker's general error, not the code.
    const other = explainRefusal({ ...refused, message: `${SELECTION_RULE_PREFIX}custom` }, picker);
    expect(other).toMatchObject({ message: picker.error });
    expect(JSON.stringify(other)).not.toContain('selection_rule');
  });

  test('other answers are left as they are', () => {
    const plain: BookResult = { ok: false, reason: 'error', message: 'Something else' };
    expect(explainRefusal(plain, picker)).toBe(plain);
    const conflict: BookResult = { ok: false, reason: 'conflict', keys: ['a'] };
    expect(explainRefusal(conflict, picker)).toBe(conflict);
    const done: BookResult = { ok: true, data: { holdId: 'h' } };
    expect(explainRefusal(done, picker)).toBe(done);
  });

  test('the server answer for a lone seat becomes the picker sentence', () => {
    const hall = db().halls.get('kamerny-hall');
    if (!hall) throw new Error('no hall');
    const session = makeSession(hall, {
      id: unique('gap'),
      date: '2099-01-01',
      time: '12:00',
      format: '2D',
      occupancyPercent: 0,
    });
    db().sessions.set(session.id, session);
    const layout = layoutOf(session.hallVersionId);
    if (!layout) throw new Error('no layout');
    // s1 and s3 leave s2 alone between them.
    const keys = ['main.r1.s1', 'main.r1.s3'];
    const result = bookSeats({
      sessionId: session.id,
      viewerId: 'viewer-gap',
      keys,
      attemptId: unique('a'),
      prices: quotePrices(layout, undefined, keys),
      now: Date.now(),
    });
    expect(result).toMatchObject({ ok: false, reason: 'error' });
    expect(explainRefusal(result, picker)).toMatchObject({
      message: 'Please don’t leave a single empty seat',
    });
  });
});

test.describe('ticket labels', () => {
  test('a layout has one seat index, reused by every answer', () => {
    const layout = layoutOf('kamerny-hall@1');
    if (!layout) throw new Error('no layout');
    const index = seatIndexOf(layout);
    expect(seatIndexOf(layout)).toBe(index);
    expect(index.get(layout.seats[0]?.key ?? '')?.label).toBe(layout.seats[0]?.label);
    // Another layout (another version) has its own.
    const parsed = parseHallConfig(kamerny());
    if (!parsed.ok) throw new Error('sample hall does not parse');
    expect(seatIndexOf(buildHallLayout(parsed.config))).not.toBe(index);
  });
});

test.describe('tickets after a showtime moves to a version that renames seats', () => {
  test('the ticket names its seats the way the seat map of the new version does', () => {
    const NOW = Date.now();
    const created = createHall({ yaml: kamerny(), name: unique('Relabel'), asNew: true });
    if (!created.body.ok) throw new Error(created.body.message);
    const hall = db().halls.get(created.body.hall.id);
    if (!hall) throw new Error('no hall');
    const session = makeSession(hall, {
      id: `${hall.id}-s`,
      date: '2099-01-01',
      time: '18:30',
      format: '2D',
      occupancyPercent: 0,
    });
    db().sessions.set(session.id, session);
    const keys = ['main.r2.s3', 'main.r2.s4'];
    const layout = layoutOf(session.hallVersionId);
    if (!layout) throw new Error('no layout');
    const booked = bookSeats({
      sessionId: session.id,
      viewerId: 'viewer-r',
      keys,
      attemptId: unique('a'),
      prices: quotePrices(layout, undefined, keys),
      now: NOW,
    });
    if (!booked.ok) throw new Error(JSON.stringify(booked));
    const holdId = (booked.data as { holdId: string }).holdId;
    const bought = purchaseInSession(session, 'viewer-r', holdId, NOW + 1000, keys);
    if (!bought.ok) throw new Error(bought.message);
    expect(bought.ticket.seats).toEqual(['B3', 'B4']);

    // Version 2 numbers the rows instead of lettering them: the same seats, other labels.
    const current = db().versions.get(hall.currentVersionId);
    if (!current) throw new Error('no version');
    const config = structuredClone(current.config);
    config.layout.rowLabels = 'numeric';
    const next = makeVersion(hall.id, 2, config, current.source);
    db().versions.set(next.id, next);
    hall.versionIds.push(next.id);
    hall.currentVersionId = next.id;
    const outcome = repinHall(hall.id, undefined);
    if (!outcome.body.ok) throw new Error(outcome.body.message);
    expect(outcome.body.moved.map((entry) => entry.sessionId)).toContain(session.id);

    const index = createSeatIndex(next.layout);
    const shown = keys.map((key) => index.get(key)?.label);
    expect(shown).not.toEqual(['B3', 'B4']);
    const listed = getOccupancyResponse(session.id, 'viewer-r', NOW + 2000)?.ownTickets ?? [];
    expect(listed.map((entry) => entry.ticket.seats)).toEqual([shown]);
    // A repeated purchase answers with the same ticket, named the same way.
    const again = purchaseInSession(session, 'viewer-r', holdId, NOW + 3000, keys);
    expect(again.ok && again.ticket.seats).toEqual(shown);
    expect(again.ok && again.ticket.number).toBe(bought.ticket.number);
  });
});

test.describe('moving showtimes after temporary holds', () => {
  function hallWithShowtime(): { hallId: string; session: SessionRecord } {
    const created = createHall({ yaml: kamerny(), name: unique('Retry'), asNew: true });
    if (!created.body.ok) throw new Error(created.body.message);
    const hall = db().halls.get(created.body.hall.id);
    if (!hall) throw new Error('no hall');
    const session = makeSession(hall, {
      id: `${hall.id}-s`,
      date: '2099-01-01',
      time: '18:30',
      format: '2D',
      occupancyPercent: 0,
    });
    db().sessions.set(session.id, session);
    // Version 2 has nine seats per row: seat 10 of every row disappears.
    const current = db().versions.get(hall.currentVersionId);
    if (!current) throw new Error('no version');
    const config = structuredClone(current.config);
    const section = config.layout.bands[0]?.sections[0];
    if (!section) throw new Error('no section');
    section.seatsPerRow = 9;
    const next = makeVersion(hall.id, 2, config, current.source);
    db().versions.set(next.id, next);
    hall.versionIds.push(next.id);
    hall.currentVersionId = next.id;
    return { hallId: hall.id, session };
  }

  test('a move refused only for a held seat stays retryable and goes through once it ends', () => {
    const { hallId, session } = hallWithShowtime();
    const booked = bookSeats({
      sessionId: session.id,
      viewerId: 'viewer-a',
      keys: ['main.r6.s10'],
      attemptId: 'a-1',
      prices: [{ key: 'main.r6.s10', price: 350 }],
      now: Date.now(),
    });
    expect(booked.ok).toBe(true);
    const first = repinHall(hallId, undefined);
    if (!isRepinResponse(first.body) || !first.body.ok) throw new Error('repin failed');
    expect(first.body.refused).toMatchObject([{ sessionId: session.id, retryable: true }]);
    // The panel still offers the move for that showtime.
    const views = [{ id: session.id, versionRev: 1 }];
    expect(movableCount(views, 2, first.body)).toBe(1);

    // The hold ends (here: it is released), and the same button now moves the showtime.
    session.holds.clear();
    const second = repinHall(hallId, undefined);
    if (!second.body.ok) throw new Error('repin failed');
    expect(second.body).toMatchObject({ moved: [{ sessionId: session.id }], refused: [] });
  });

  test('a move refused for a sold seat is not offered again', () => {
    const { hallId, session } = hallWithShowtime();
    session.sold.set('main.r6.s10', 'T-1');
    const outcome = repinHall(hallId, undefined);
    if (!outcome.body.ok) throw new Error('repin failed');
    expect(outcome.body.refused).toMatchObject([{ sessionId: session.id, retryable: false }]);
    expect(movableCount([{ id: session.id, versionRev: 1 }], 2, outcome.body)).toBe(0);
    expect(isRepinResponse(outcome.body)).toBe(true);
  });

  test('without a refusal every outdated showtime counts; current ones do not', () => {
    const sessions = [
      { id: 'a', versionRev: 1 },
      { id: 'b', versionRev: 2 },
    ];
    expect(movableCount(sessions, 2, null)).toBe(1);
  });
});

test.describe('the booking view draws the balconies the server checked', () => {
  test('slab and railing sizes written in the hall file are not used for the booking view', () => {
    const config = configOf('bolshoy-hall@1');
    const constraints = { ...(config.constraints as object | undefined) };
    const hall = parseHallConfig(
      JSON.stringify({
        ...config,
        constraints: { ...constraints, balconySlabThickness: 2.5, balconyParapetHeight: 3 },
      }),
      { format: 'yaml' },
    );
    expect(hall.ok).toBe(true);
    if (!hall.ok) return;
    const own = buildHallLayout(hall.config);
    expect(own.balconySlabThickness).toBe(2.5);
    const shown = bookingLayout(hall.config);
    const server = buildHallLayout(hall.config, { enforce: true });
    expect(shown.balconySlabThickness).toBe(server.balconySlabThickness);
    expect(shown.balconyParapetHeight).toBe(server.balconyParapetHeight);
    expect(shown.balconySlabThickness).not.toBe(2.5);
    expect(shown.balconyParapetHeight).not.toBe(3);
  });
});
