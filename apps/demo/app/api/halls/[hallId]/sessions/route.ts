import { NextResponse, type NextRequest } from 'next/server';
import { readJsonBody } from '@/lib/server/http';
import { createSessions, listSessions } from '@/lib/server/sessions';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ hallId: string }> };

/** Sessions of the hall, earliest first, with the version each one is pinned to. */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { hallId } = await context.params;
  const sessions = listSessions(hallId);
  if (!sessions) {
    return NextResponse.json(
      { ok: false, error: 'hall_not_found', message: 'Hall not found.' },
      { status: 404 },
    );
  }
  return NextResponse.json({ sessions }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Creates sessions on the hall's current version. Body: `{ from, to, slots: [{ time, format }],
 * prices?, occupancyPercent? }`: every date of the range × every slot. One session is a range of
 * one day with one slot.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { hallId } = await context.params;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const outcome = createSessions(hallId, body.value);
  return NextResponse.json(outcome.body, { status: outcome.status });
}
