import { NextResponse, type NextRequest } from 'next/server';
import { getHallResponse, saveHall } from '@/lib/server/halls';
import { badRequest, hasOnlyKeys, isRecord, readJsonBody } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ hallId: string }> };

/** The current hall version: its config, revision and the last saved YAML. */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { hallId } = await context.params;
  const body = getHallResponse(hallId);
  if (!body) return NextResponse.json({ error: 'hall_not_found' }, { status: 404 });
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Save from the constructor. Body: `{ baseRevision, yaml }` and nothing else. The whole request is
 * limited (see `body-limit.ts`); the YAML itself by the parser. Answers with a `SaveResult` plus
 * the revision the server holds now.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { hallId } = await context.params;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const input = body.value;
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, ['baseRevision', 'yaml']) ||
    typeof input.baseRevision !== 'number' ||
    !Number.isInteger(input.baseRevision) ||
    typeof input.yaml !== 'string'
  ) {
    return badRequest('Provide only baseRevision (an integer) and yaml (text).');
  }
  const result = saveHall(hallId, input.baseRevision, input.yaml);
  if (!result) return NextResponse.json({ error: 'hall_not_found' }, { status: 404 });
  return NextResponse.json(result);
}
