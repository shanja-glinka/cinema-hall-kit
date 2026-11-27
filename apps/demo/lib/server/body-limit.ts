/**
 * Reading a request body with a hard size limit. Pure web-standard code (no Next imports), so it
 * can be tested on its own.
 */

/** The YAML a host accepts: the library's own default (`LIMITS.maxBytes`), 256 KiB. */
export const MAX_YAML_BYTES = 256 * 1024;

/**
 * The hall text the demo stores and reads back. The server writes the hall's id into an accepted
 * file (and, for a hall made in the constructor, a header comment of its own), so a file at
 * `MAX_YAML_BYTES` can grow a little; this headroom keeps that stored text readable, copyable and
 * savable. Uploads are still limited to `MAX_YAML_BYTES`.
 */
export const MAX_STORED_YAML_BYTES = MAX_YAML_BYTES + 4 * 1024;

/**
 * The JSON envelope around a YAML text. JSON escaping at most doubles the valid characters of a
 * YAML file (a new line or a quote becomes two), so the limit is twice the YAML limit plus 64 KiB
 * for the other fields. The decoded YAML is still limited to `MAX_YAML_BYTES` by the parser.
 */
export const MAX_BODY_BYTES = 2 * MAX_YAML_BYTES + 64 * 1024;

export type BodyText =
  { ok: true; text: string } | { ok: false; reason: 'too_large' | 'unreadable' };

/**
 * Reads the body as UTF-8 text and stops as soon as it is larger than `maxBytes`. The declared
 * `Content-Length` is only a hint: the bytes actually received are counted, so a chunked body
 * or a false header cannot get past the limit.
 * @param request Any `Request` with a body.
 * @param maxBytes Largest accepted body.
 */
export async function readBodyText(
  request: Request,
  maxBytes: number = MAX_BODY_BYTES,
): Promise<BodyText> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: 'too_large' };
  const stream = request.body;
  if (!stream) return { ok: true, text: '' };

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}
