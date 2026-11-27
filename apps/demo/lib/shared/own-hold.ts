/**
 * The booking page's view of the viewer's own reservation: which hold to restore after a reload,
 * which hold a purchase belongs to, the prices the viewer is shown, how a purchase is sent, and
 * what the booking panel shows. Pure, so the browser and the
 * tests share it.
 */
import {
  priceForSeat,
  resolvePricing,
  type HallLayout,
  type Price,
  type Pricing,
  type SeatKey,
} from '@cinema-hall/core';
import type { OwnHold, OwnTicket, Ticket } from './types';

/**
 * The reservation to restore when the page opens: the viewer's latest active hold, or `null`.
 * @param holds The viewer's holds from the occupancy answer (latest first).
 * @param now Epoch milliseconds, server time.
 */
export function restorableHold(holds: readonly OwnHold[] | undefined, now: number): OwnHold | null {
  return (
    (holds ?? [])
      .filter((hold) => Date.parse(hold.expiresAt) > now)
      .sort((a, b) => Date.parse(b.expiresAt) - Date.parse(a.expiresAt))[0] ?? null
  );
}

/**
 * The seats of `keys` that one of the viewer's active reservations already holds. A new
 * reservation that includes them is refused by the server as a whole, so the page asks the viewer
 * to buy or release the existing reservation first.
 * @param keys The seats to reserve.
 * @param holds The viewer's reservations from the occupancy answer.
 * @param now Epoch milliseconds, server time.
 */
export function seatsInOwnHolds(
  keys: readonly SeatKey[],
  holds: readonly OwnHold[] | undefined,
  now: number,
): SeatKey[] {
  const held = new Set(
    (holds ?? []).filter((hold) => Date.parse(hold.expiresAt) > now).flatMap((hold) => hold.keys),
  );
  return keys.filter((key) => held.has(key));
}

/**
 * The hold that covers all of `keys`, for a purchase of a reservation the page did not make itself
 * (a restored one). `undefined` when no single hold covers them.
 */
export function holdIdFor(
  keys: readonly SeatKey[],
  holds: readonly OwnHold[] | undefined,
): string | undefined {
  if (keys.length === 0) return undefined;
  return (holds ?? []).find((hold) => keys.every((key) => hold.keys.includes(key)))?.holdId;
}

/** Which reservation a purchase of the selected seats goes through. */
export type PurchaseHold =
  | { kind: 'hold'; holdId: string }
  /** The seats belong to two or more reservations: no single one can sell them all. */
  | { kind: 'split' }
  /** No reservation is known for these seats. */
  | { kind: 'none' };

/**
 * The reservation that covers every selected seat, for the purchase step. A viewer can reserve
 * some seats, deselect them, reserve others and select the first again: the selection then spans
 * two reservations and a purchase through either one would be refused, so that case is reported
 * as `split` instead of sending the wrong reservation.
 * @param keys The seats to buy.
 * @param holds The viewer's active reservations from the latest occupancy answer.
 * @param preferred The reservation the page knows for this selection (made here, or restored).
 * It is used as it is when the occupancy answer does not know the seats yet (it may be a moment
 * old); the server checks the purchase in any case.
 */
export function holdForPurchase(
  keys: readonly SeatKey[],
  holds: readonly OwnHold[] | undefined,
  preferred: string | undefined,
): PurchaseHold {
  if (keys.length === 0) return { kind: 'none' };
  const list = holds ?? [];
  const covers = (hold: OwnHold): boolean => keys.every((key) => hold.keys.includes(key));
  const own = preferred === undefined ? undefined : list.find((hold) => hold.holdId === preferred);
  if (own && covers(own)) return { kind: 'hold', holdId: own.holdId };
  const covering = list.find(covers);
  if (covering) return { kind: 'hold', holdId: covering.holdId };
  const owners = keys.map((key) => list.find((hold) => hold.keys.includes(key))?.holdId);
  if (owners.every((owner) => owner !== undefined) && new Set(owners).size > 1) {
    return { kind: 'split' };
  }
  return preferred === undefined ? { kind: 'none' } : { kind: 'hold', holdId: preferred };
}

/**
 * The price of each seat as the picker shows it (the hall prices with the showtime's overrides),
 * sent with a purchase so the server can refuse it when a price has changed since.
 * Seats without a price are left out.
 */
export function quotePrices(
  layout: HallLayout,
  pricing: Pricing | undefined,
  keys: readonly SeatKey[],
): { key: SeatKey; price: Price }[] {
  const resolved = resolvePricing(layout.pricing, pricing);
  const seats = new Map(layout.seats.map((seat) => [seat.key, seat] as const));
  return keys.flatMap((key) => {
    const seat = seats.get(key);
    const price = seat ? priceForSeat(resolved, seat) : null;
    return price === null ? [] : [{ key, price }];
  });
}

/**
 * The seats of `keys` that have no price (the hall prices with the showtime's overrides), in the
 * order of `keys`. A purchase of such a seat is refused every time (its price cannot match a
 * quote), so the booking page turns confirming off while one is selected.
 */
export function unpricedSeats(
  layout: HallLayout,
  pricing: Pricing | undefined,
  keys: readonly SeatKey[],
): SeatKey[] {
  const priced = new Set(quotePrices(layout, pricing, keys).map((entry) => entry.key));
  return keys.filter((key) => !priced.has(key));
}

/**
 * The selected seats still to be bought: the selection without the seats of the viewer's tickets.
 * A bought seat can stay selected after its purchase; the picker does not reserve, quote or buy it
 * again, so the page leaves it out of its checks too.
 * @param selected The selected seats.
 * @param tickets The viewer's tickets in this showtime.
 */
export function seatsToBuy(selected: readonly SeatKey[], tickets: readonly OwnTicket[]): SeatKey[] {
  const bought = new Set(tickets.flatMap((entry) => entry.ticket.keys));
  return selected.filter((key) => !bought.has(key));
}

/** What the booking panel shows. */
export type BookingPanel =
  | { kind: 'hold'; holdId: string; expiresAt: string | null }
  | { kind: 'ticket'; holdId: string; ticket: Ticket };

/**
 * The booking panel, from what the page knows: the reservation it shows and the viewer's tickets
 * (from the server's occupancy answer, and the answer of a purchase made on this page). A
 * reservation that has a ticket is shown as that ticket, however the page learnt about it: the
 * purchase answer, or a later occupancy answer when the purchase answer was lost. Without a
 * reservation the latest ticket that was not closed is shown.
 * @param hold The reservation on the page, or `null`.
 * @param tickets The viewer's tickets, latest first; the same hold may come twice.
 * @param closed Holds whose ticket the viewer closed on this page.
 */
export function bookingPanel(
  hold: { holdId: string; expiresAt: string | null } | null,
  tickets: readonly OwnTicket[],
  closed: ReadonlySet<string>,
): BookingPanel | null {
  if (hold) {
    const bought = tickets.find((entry) => entry.holdId === hold.holdId);
    return bought
      ? { kind: 'ticket', holdId: bought.holdId, ticket: bought.ticket }
      : { kind: 'hold', holdId: hold.holdId, expiresAt: hold.expiresAt };
  }
  const latest = tickets.find((entry) => !closed.has(entry.holdId));
  return latest ? { kind: 'ticket', holdId: latest.holdId, ticket: latest.ticket } : null;
}

/**
 * Sends a purchase and, when no answer arrives (the connection dropped), sends the same purchase
 * again. That is safe: the server sells a reservation once and answers a repeat with the same
 * ticket, so nothing is bought twice.
 * @param send One purchase request; it throws when no answer arrived.
 * @param attempts How many times it is sent at most.
 * @param wait The pause before the next attempt (number = which retry, from 1).
 * @returns The server's answer, or `null` when none arrived. Then the purchase may still have gone
 * through: its ticket comes with the next occupancy answer (`ownTickets`).
 */
export async function sendPurchase<T>(
  send: () => Promise<T>,
  attempts = 3,
  wait: (retry: number) => Promise<void> = (retry) =>
    new Promise((resolve) => setTimeout(resolve, 500 * retry)),
): Promise<T | null> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await send();
    } catch {
      if (attempt < attempts) await wait(attempt);
    }
  }
  return null;
}
