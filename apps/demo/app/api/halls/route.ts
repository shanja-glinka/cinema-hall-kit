import { NextResponse, type NextRequest } from 'next/server';
import type { CreateHallBody, GeneratorInput } from '@/lib/shared/types';
import { allHallCards } from '@/lib/server/cards';
import { createHall } from '@/lib/server/halls';
import { hasOnlyKeys, isRecord, readJsonBody } from '@/lib/server/http';
import { t } from '@/lib/shared/texts';

export const dynamic = 'force-dynamic';

/** Every hall with its tiers, seat count, current version and sessions. */
export function GET() {
  return NextResponse.json({ halls: allHallCards() }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Creates a hall from YAML, and its sessions when `generator` is given. Body:
 * `{ yaml, cinema?, generator?, name?, asNew? }`. The hall is parsed and validated here with
 * `validateHall(…, { enforce: true })`, whatever the browser checked before.
 * 201 `{ ok, hall, created, requestedId?, stored }` (`stored`: the hall's config, text and revision); 400 `{ ok: false, error, message, issues? | field? }`.
 */
export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const input = toCreateBody(body.value);
  if (!input) {
    return NextResponse.json(
      { ok: false, error: 'bad_request', message: t.server.yamlRequired },
      { status: 400 },
    );
  }
  const outcome = createHall(input);
  return NextResponse.json(outcome.body, { status: outcome.status });
}

function toCreateBody(value: unknown): CreateHallBody | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['yaml', 'cinema', 'generator', 'name', 'asNew'])) {
    return null;
  }
  if (typeof value.yaml !== 'string') return null;
  if (value.cinema !== undefined && typeof value.cinema !== 'string') return null;
  if (value.name !== undefined && typeof value.name !== 'string') return null;
  if (value.asNew !== undefined && typeof value.asNew !== 'boolean') return null;
  if (value.generator !== undefined && !isRecord(value.generator)) return null;
  return {
    yaml: value.yaml,
    ...(typeof value.cinema === 'string' ? { cinema: value.cinema } : {}),
    ...(typeof value.name === 'string' ? { name: value.name } : {}),
    ...(value.asNew === true ? { asNew: true } : {}),
    // The generator's fields are checked by `planSessions`; here it only has to be an object.
    ...(isRecord(value.generator)
      ? { generator: value.generator as unknown as GeneratorInput }
      : {}),
  };
}
