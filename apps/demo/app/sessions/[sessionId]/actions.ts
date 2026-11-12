'use server';

import { cookies } from 'next/headers';
import type { BookResult, Price, SeatKey } from '@cinema-hall/core';
import { bookSeats } from '@/lib/server/booking';
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

function isHoldRequest(sessionId: unknown, keys: unknown, options: unknown): boolean {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return false;
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > MAX_KEYS) return false;
  if (!keys.every((key) => typeof key === 'string')) return false;
  if (typeof options !== 'object' || options === null) return false;
  const { attemptId, prices } = options as Record<string, unknown>;
  if (typeof attemptId !== 'string' || attemptId.length === 0) return false;
  if (attemptId.length > MAX_ATTEMPT_ID) return false;
  return Array.isArray(prices) && prices.every(isPriceEntry);
}

function isPriceEntry(entry: unknown): boolean {
  if (typeof entry !== 'object' || entry === null) return false;
  const { key, price } = entry as Record<string, unknown>;
  return typeof key === 'string' && typeof price === 'number' && Number.isFinite(price);
}
