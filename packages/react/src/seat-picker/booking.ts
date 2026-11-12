import type { BookContext, BookResult, Price, SeatKey } from '@cinema-hall/core';

/** The host callback that books seats: receives the keys and a `BookContext`, resolves to a `BookResult`. */
export type OnBook<TData = unknown> = (
  keys: SeatKey[],
  ctx: BookContext,
) => Promise<BookResult<TData>>;

const failure = (): BookResult => ({ ok: false, reason: 'error' });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * UUID for the Idempotency-Key. Called from event handlers only (never during render).
 * @returns A new attempt id.
 */
export function newAttemptId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * The prices the viewer sees, one per selected seat that has a price.
 * @param keys - Selected seat keys.
 * @param priceOf - Price lookup (plain units, never converted); `null` for a seat without a price.
 * @returns Rows `{ key, price }` for `BookContext.prices`.
 */
export function priceRows(
  keys: readonly SeatKey[],
  priceOf: (key: SeatKey) => Price | null,
): { key: SeatKey; price: Price }[] {
  const rows: { key: SeatKey; price: Price }[] = [];
  for (const key of keys) {
    const price = priceOf(key);
    if (price !== null) rows.push({ key, price });
  }
  return rows;
}

/**
 * Checks the shape of whatever the host returned, variant by variant. A conflict needs its seat
 * keys, an ok result needs its data, and anything else becomes a plain error, so the picker never
 * trusts a malformed result.
 * @param raw - The value the host resolved with.
 * @returns A well-formed `BookResult`.
 */
export function normalizeBookResult(raw: unknown): BookResult {
  if (!isRecord(raw)) return failure();
  if (raw.ok === true) {
    if (!('data' in raw)) return failure();
    const hold =
      isRecord(raw.hold) && typeof raw.hold.expiresAt === 'string'
        ? { expiresAt: raw.hold.expiresAt }
        : undefined;
    const revision =
      typeof raw.revision === 'number' || typeof raw.revision === 'string'
        ? raw.revision
        : undefined;
    return {
      ok: true,
      data: raw.data,
      ...(hold ? { hold } : {}),
      ...(revision !== undefined ? { revision } : {}),
    };
  }
  if (raw.ok !== false) return failure();
  switch (raw.reason) {
    case 'conflict': {
      if (!Array.isArray(raw.keys)) return failure();
      const keys = raw.keys.filter((key: unknown): key is SeatKey => typeof key === 'string');
      if (keys.length !== raw.keys.length) return failure();
      return { ok: false, reason: 'conflict', keys };
    }
    case 'price_changed':
      return { ok: false, reason: 'price_changed' };
    case 'closed':
      return { ok: false, reason: 'closed' };
    case 'error':
      return {
        ok: false,
        reason: 'error',
        ...(typeof raw.message === 'string' ? { message: raw.message } : {}),
        ...(typeof raw.retryable === 'boolean' ? { retryable: raw.retryable } : {}),
      };
    default:
      return failure();
  }
}

/**
 * Runs the host's `onBook`. A throw or a rejected promise becomes `{ ok: false, reason: 'error' }`;
 * the error text is not shown to the viewer.
 * @param onBook - The host callback.
 * @param keys - Canonical selection to book.
 * @param prices - Prices the viewer saw (`BookContext.prices`).
 * @param attemptId - Idempotency key of this attempt.
 * @param signal - Aborted when the picker unmounts.
 * @returns The normalized result.
 */
export async function runBook<TData = unknown>(
  onBook: OnBook<TData>,
  keys: SeatKey[],
  prices: BookContext['prices'],
  attemptId: string,
  signal: AbortSignal,
): Promise<BookResult<TData>> {
  try {
    const raw: unknown = await onBook(keys, { attemptId, prices, signal });
    return normalizeBookResult(raw) as BookResult<TData>;
  } catch {
    return { ok: false, reason: 'error', retryable: true };
  }
}
