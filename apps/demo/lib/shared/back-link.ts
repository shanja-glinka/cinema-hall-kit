/**
 * The way back from a booking page: to the page the visitor opened the showtime from (the home
 * page, the hall's showtimes, the hall editor), or to the hall's showtimes when the booking page
 * was opened directly. Links to a showtime record the page they are on and the showtime they open
 * (`rememberOrigin`); moving between the showtimes of that hall keeps that origin, and a booking page
 * of another showtime opened directly does not take it over. Pure helpers plus sessionStorage access.
 */

/** sessionStorage key of the page a booking page was opened from. */
export const BACK_KEY = 'cinema-hall-demo:booking-origin';

export type BackKind = 'home' | 'showtimes' | 'editor' | 'other';

export interface BackTarget {
  href: string;
  kind: BackKind;
}

/**
 * Where the back link of a booking page goes.
 * @param origin The stored page (`/`, `/halls/x/showtimes`, `/constructor?hall=x`), or null.
 * @param hallId The hall of the showtime.
 * @returns The link and what it leads to; the hall's showtimes without a usable origin.
 */
export function backTarget(origin: string | null, hallId: string): BackTarget {
  const fallback: BackTarget = {
    href: `/halls/${encodeURIComponent(hallId)}/showtimes`,
    kind: 'showtimes',
  };
  // Only a path of this site: no other origin, no protocol-relative URL, no booking page.
  if (origin === null || !origin.startsWith('/') || origin.startsWith('//')) return fallback;
  if (origin.startsWith('/sessions/')) return fallback;
  const path = origin.split(/[?#]/)[0] ?? origin;
  if (path === '/') return { href: origin, kind: 'home' };
  if (/^\/halls\/[^/]+\/showtimes\/?$/.test(path)) return { href: origin, kind: 'showtimes' };
  if (path === '/constructor') return { href: origin, kind: 'editor' };
  return { href: origin, kind: 'other' };
}

/**
 * What is stored: the page a showtime was opened from, and the booking it was opened for. The
 * booking page adds its hall, so the other showtimes of that hall (the links on the booking page)
 * keep the way back. A booking page of another hall, opened directly, does not use it.
 */
interface StoredOrigin {
  from: string;
  sessionId: string;
  hallId?: string;
}

/** The session id of a booking link (`/sessions/<id>`, maybe with a query), or null. */
function sessionOf(href: string): string | null {
  const match = /^\/sessions\/([^/?#]+)/.exec(href);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function parseStored(text: string | null): StoredOrigin | null {
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null) return null;
    const { from, sessionId, hallId } = value as Record<string, unknown>;
    if (typeof from !== 'string' || typeof sessionId !== 'string') return null;
    if (hallId !== undefined && typeof hallId !== 'string') return null;
    return { from, sessionId, ...(hallId === undefined ? {} : { hallId }) };
  } catch {
    // An older plain value, or not ours: no origin.
    return null;
  }
}

function store(storage: Pick<Storage, 'setItem'> | undefined, value: StoredOrigin): void {
  try {
    storage?.setItem(BACK_KEY, JSON.stringify(value));
  } catch {
    // Storage may be blocked: the back link then leads to the hall's showtimes.
  }
}

/**
 * Called for a click anywhere in the app: a click on a link to a showtime, made outside a booking
 * page, records the current page as the way back from that showtime.
 * @param href The link's `href` attribute.
 * @param current The current path with its query, `location.pathname + location.search`.
 * @param storage Where to keep it (sessionStorage in the app).
 */
export function rememberOrigin(
  href: string,
  current: string,
  storage: Pick<Storage, 'setItem'> | undefined,
): void {
  if (current.startsWith('/sessions/')) return;
  const sessionId = sessionOf(href);
  if (sessionId === null) return;
  store(storage, { from: current, sessionId });
}

/**
 * The stored origin of this booking page, or null. It counts for the booking it was recorded for,
 * and for the other showtimes of the same hall reached from there; a booking page that was opened
 * directly (another hall, an address typed or bookmarked) gets null and falls back to its hall's
 * showtimes. When it counts, it is tied to this hall from now on.
 * @param storage sessionStorage in the app.
 * @param booking The session and hall of the page asking.
 */
export function readOrigin(
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
  booking: { sessionId: string; hallId: string },
): string | null {
  let stored: StoredOrigin | null;
  try {
    stored = parseStored(storage?.getItem(BACK_KEY) ?? null);
  } catch {
    return null;
  }
  if (!stored) return null;
  const same =
    stored.sessionId === booking.sessionId ||
    (stored.hallId !== undefined && stored.hallId === booking.hallId);
  if (!same) return null;
  if (stored.sessionId !== booking.sessionId || stored.hallId !== booking.hallId) {
    store(storage, { from: stored.from, sessionId: booking.sessionId, hallId: booking.hallId });
  }
  return stored.from;
}
