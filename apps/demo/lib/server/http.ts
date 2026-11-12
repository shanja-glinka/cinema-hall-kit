import { NextResponse, type NextRequest } from 'next/server';
import { readBodyText } from './body-limit';

export type JsonBody = { ok: true; value: unknown } | { ok: false; response: NextResponse };

/**
 * Reads a JSON body under the request limit of `body-limit.ts`. Answers 413 for a body that is
 * too large and 400 for text that is not JSON.
 */
export async function readJsonBody(request: NextRequest): Promise<JsonBody> {
  const body = await readBodyText(request);
  if (!body.ok) {
    return body.reason === 'too_large' ? failure(413, 'too_large') : failure(400, 'bad_request');
  }
  try {
    return { ok: true, value: JSON.parse(body.text) };
  } catch {
    return failure(400, 'bad_request');
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when the object has no keys besides the allowed ones. */
export function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ ok: false, error: 'bad_request', message }, { status: 400 });
}

function failure(status: 400 | 413, error: 'too_large' | 'bad_request'): JsonBody {
  const message =
    error === 'too_large' ? 'Request is too large.' : 'Request body is not valid JSON.';
  return {
    ok: false,
    response: NextResponse.json({ ok: false, error, message }, { status }),
  };
}
