'use server';

import { cookies } from 'next/headers';
import type { BookResult, Price, SeatKey } from '@cinema-hall/core';
import { bookSeats, purchaseHold } from '@/lib/server/booking';
import type { PurchaseResult } from '@/lib/shared/types';
import { VIEWER_COOKIE, VIEWER_COOKIE_OPTIONS, isViewerId, newViewerId } from '@/lib/server/viewer';

const MAX_KEYS = 20;
const MAX_ATTEMPT_ID = 64;

interface HoldOptions {
  attemptId: string;
  prices: { key: SeatKey; price: Price }[];
}

/**
 * Holds the selected seats for the calling viewer. Called from the picker's `onBook`.
 * The arguments come from the browser, so they are checked again here.
 */
export async function holdSeats(
  sessionId: string,
  keys: SeatKey[],
  options: HoldOptions,
): Promise<BookResult> {
  if (!isHoldRequest(sessionId, keys, options)) {
    return { ok: false, reason: 'error', message: 'bad_request', retryable: false };
  }
  const jar = await cookies();
  const current = jar.get(VIEWER_COOKIE)?.value;
  const viewerId = isViewerId(current) ? current : newViewerId();
  if (viewerId !== current) jar.set(VIEWER_COOKIE, viewerId, VIEWER_COOKIE_OPTIONS);

  return bookSeats({
    sessionId,
    viewerId,
    keys,
    attemptId: options.attemptId,
    prices: options.prices,
    now: Date.now(),
  });
}

/**
 * Demo purchase: the confirmed seats of the caller's hold become sold seats and a ticket; the
 * rest of the hold is released. No payment is taken. Called from the booking page with the seats
 * the viewer confirmed and the price of each as shown on the confirm button: when a price has
 * changed since, nothing is sold (`price_changed`, with the new total). The arguments come from
 * the browser, so they are checked again here.
 */
export async function purchaseSeats(
  sessionId: string,
  holdId: string,
  keys: SeatKey[],
  prices?: { key: SeatKey; price: Price }[],
): Promise<PurchaseResult> {
  if (
    typeof sessionId !== 'string' ||
    sessionId.length === 0 ||
    typeof holdId !== 'string' ||
    holdId.length === 0 ||
    holdId.length > MAX_ATTEMPT_ID ||
    !isKeyList(keys) ||
    (prices !== undefined && !isPriceList(prices))
  ) {
    return { ok: false, reason: 'bad_request', message: 'The request was not understood.' };
  }
  const jar = await cookies();
  const viewerId = jar.get(VIEWER_COOKIE)?.value;
  if (!isViewerId(viewerId)) {
    return {
      ok: false,
      reason: 'not_found',
      message: 'These seats are no longer held for you. Choose them again.',
    };
  }
  return purchaseHold({
    sessionId,
    viewerId,
    holdId,
    keys,
    ...(prices !== undefined ? { prices } : {}),
    now: Date.now(),
  });
}

function isKeyList(keys: unknown): keys is SeatKey[] {
  return (
    Array.isArray(keys) &&
    keys.length > 0 &&
    keys.length <= MAX_KEYS &&
    keys.every((key) => typeof key === 'string')
  );
}

function isHoldRequest(sessionId: unknown, keys: unknown, options: unknown): boolean {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return false;
  if (!isKeyList(keys)) return false;
  if (typeof options !== 'object' || options === null) return false;
  const { attemptId, prices } = options as Record<string, unknown>;
  if (typeof attemptId !== 'string' || attemptId.length === 0) return false;
  if (attemptId.length > MAX_ATTEMPT_ID) return false;
  return isPriceList(prices);
}

function isPriceList(prices: unknown): prices is { key: SeatKey; price: Price }[] {
  return Array.isArray(prices) && prices.length <= MAX_KEYS && prices.every(isPriceEntry);
}

function isPriceEntry(entry: unknown): boolean {
  if (typeof entry !== 'object' || entry === null) return false;
  const { key, price } = entry as Record<string, unknown>;
  return typeof key === 'string' && typeof price === 'number' && Number.isFinite(price);
}
