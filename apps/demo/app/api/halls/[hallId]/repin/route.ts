import { NextResponse, type NextRequest } from 'next/server';
import { badRequest, hasOnlyKeys, isRecord, readJsonBody } from '@/lib/server/http';
import { repinHall } from '@/lib/server/sessions';

export const dynamic = 'force-dynamic';

/**
 * Moves the hall's future sessions to a version. Body: `{ toRev? }` (default: the current
 * version). A session whose held or taken seats the move would remove stays on its version and
 * is listed under `refused` with those seats.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await context.params;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  // An absent `toRev` means "the current version", so the body itself must be an object: `null`,
  // an array or a number is a malformed request, not a request for the default.
  if (!isRecord(body.value) || !hasOnlyKeys(body.value, ['toRev'])) {
    return badRequest('The request body must be an object such as { "toRev": 2 } or {}.');
  }
  const { toRev } = body.value;
  if (toRev !== undefined && (typeof toRev !== 'number' || !Number.isInteger(toRev) || toRev < 1)) {
    return badRequest('toRev must be a positive integer version number.');
  }
  const outcome = repinHall(hallId, toRev);
  return NextResponse.json(outcome.body, { status: outcome.status });
}
