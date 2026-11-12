/**
 * Server clock helpers. A hold expires at a server timestamp; the browser clock may be minutes
 * or hours off, so the countdown uses the offset between the server's `serverNow` and the
 * browser's `Date.now()` at the moment the snapshot arrived.
 */

/** `serverNow - localNow` in milliseconds; 0 when the server time is missing or not a date. */
export function clockOffsetMs(serverNow: string | undefined, localNow: number): number {
  if (serverNow === undefined) return 0;
  const server = Date.parse(serverNow);
  return Number.isNaN(server) ? 0 : server - localNow;
}

/** Milliseconds left until `expiresAt` (an ISO string) on the server's clock; never negative. */
export function remainingMs(
  expiresAt: string | null,
  localNow: number,
  offsetMs: number,
): number | null {
  if (expiresAt === null) return null;
  const expires = Date.parse(expiresAt);
  if (Number.isNaN(expires)) return null;
  return Math.max(0, expires - (localNow + offsetMs));
}
