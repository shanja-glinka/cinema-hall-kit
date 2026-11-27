import { NextResponse, type NextRequest } from 'next/server';
import { purchaseHold } from '@/lib/server/booking';
import { hasOnlyKeys, isRecord, readJsonBody } from '@/lib/server/http';
import { VIEWER_COOKIE, isViewerId } from '@/lib/server/viewer';

export const dynamic = 'force-dynamic';

const MAX_HOLD_ID = 64;
const MAX_KEYS = 20;

/**
 * Demo purchase: `{ holdId, keys?, prices? }` → the given seats of the calling viewer's hold (all of it
 * without `keys`) become sold seats and a ticket; the rest of the hold is released. No payment is
 * taken. 200 `{ ok: true, ticket }`; 409 `{ ok: false, reason: 'expired' | 'not_found' }`, or
 * `reason: 'selection_rule'` with the rule code in `rule` when buying only these seats
 * would break a selection rule (for example leave a lone empty seat): nothing is sold or released;
 * `reason: 'price_changed'` with the new `total` when a seat's price is not the one in `prices`
 * (`[{ key, price }]`, as the viewer saw them) or, without `prices`, the one it was reserved at;
 * 404 for an unknown showtime; 400 for a malformed body. Seats that are not in the hold are refused as
 * `not_found`. Repeating the call returns the same ticket.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const input = body.value;
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, ['holdId', 'keys', 'prices']) ||
    typeof input.holdId !== 'string' ||
    input.holdId.length === 0 ||
    input.holdId.length > MAX_HOLD_ID ||
    (input.keys !== undefined && !isKeyList(input.keys)) ||
    (input.prices !== undefined && !isPriceList(input.prices))
  ) {
    return NextResponse.json(
      {
        ok: false,
        reason: 'bad_request',
        message: `Provide holdId (text) and, optionally, keys (1 to ${MAX_KEYS} seat keys) and prices ([{ key, price }]).`,
      },
      { status: 400 },
    );
  }
  const current = request.cookies.get(VIEWER_COOKIE)?.value;
  if (!isViewerId(current)) {
    return NextResponse.json(
      { ok: false, reason: 'not_found', message: 'These seats are no longer held for you.' },
      { status: 409 },
    );
  }
  const result = purchaseHold({
    sessionId,
    viewerId: current,
    holdId: input.holdId,
    ...(input.keys !== undefined ? { keys: input.keys } : {}),
    ...(input.prices !== undefined ? { prices: input.prices } : {}),
    now: Date.now(),
  });
  const status = result.ok ? 200 : result.reason === 'closed' ? 404 : 409;
  return NextResponse.json(result, { status, headers: { 'Cache-Control': 'no-store' } });
}

function isPriceList(prices: unknown): prices is { key: string; price: number }[] {
  return (
    Array.isArray(prices) &&
    prices.length <= MAX_KEYS &&
    prices.every(
      (entry: unknown) =>
        isRecord(entry) &&
        typeof entry.key === 'string' &&
        typeof entry.price === 'number' &&
        Number.isFinite(entry.price),
    )
  );
}

function isKeyList(keys: unknown): keys is string[] {
  return (
    Array.isArray(keys) &&
    keys.length > 0 &&
    keys.length <= MAX_KEYS &&
    keys.every((key) => typeof key === 'string' && key.length > 0)
  );
}
