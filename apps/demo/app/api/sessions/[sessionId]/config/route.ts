import { NextResponse, type NextRequest } from 'next/server';
import { getSessionConfig } from '@/lib/server/booking';

export const dynamic = 'force-dynamic';

/**
 * The hall config of the version the session is pinned to, with that version's revision. An open
 * booking page calls it when the occupancy poll reports another revision than the one it drew
 * (the hall was moved to a new version).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  const body = getSessionConfig(sessionId);
  if (!body) return NextResponse.json({ error: 'session_not_found' }, { status: 404 });
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
