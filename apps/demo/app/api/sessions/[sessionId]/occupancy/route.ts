import { NextResponse, type NextRequest } from 'next/server';
import { getOccupancyResponse } from '@/lib/server/booking';
import { VIEWER_COOKIE, VIEWER_COOKIE_OPTIONS, isViewerId, newViewerId } from '@/lib/server/viewer';

// Polled every 3 s by the booking page, and always per viewer: never cache it.
export const dynamic = 'force-dynamic';

/** `{ occupancy, pricing }` for one session. `mine` marks the holds of the calling viewer. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  const current = request.cookies.get(VIEWER_COOKIE)?.value;
  const viewerId = isViewerId(current) ? current : newViewerId();
  const body = getOccupancyResponse(sessionId, viewerId, Date.now());
  if (!body) return NextResponse.json({ error: 'session_not_found' }, { status: 404 });

  const response = NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  if (viewerId !== current) response.cookies.set(VIEWER_COOKIE, viewerId, VIEWER_COOKIE_OPTIONS);
  return response;
}
