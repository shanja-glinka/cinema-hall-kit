import { NextResponse, type NextRequest } from 'next/server';
import { deleteSession } from '@/lib/server/sessions';

export const dynamic = 'force-dynamic';

/**
 * Deletes one session of the hall. 409 while it has active holds or sold tickets, with
 * the reason in the message.
 */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ hallId: string; sessionId: string }> },
) {
  const { hallId, sessionId } = await context.params;
  const outcome = deleteSession(hallId, sessionId);
  return NextResponse.json(outcome.body, { status: outcome.status });
}
