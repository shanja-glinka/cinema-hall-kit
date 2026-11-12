/**
 * Session (showtime) data the host passes at runtime, and the results of host callbacks.
 * Nothing here is part of the hall YAML.
 */
import type { HallConfig } from './schema.js';
import type { Issue } from './issues.js';
import type { HallLayout, Seat, SeatKey } from './layout.js';
import type { SeatIndex } from './seat-index.js';

/**
 * Availability of a seat in one session. `available` is free to choose. `taken` is sold. `held` is
 * reserved for a limited time. `blocked` is closed by the host. A seat that an `Occupancy` does not
 * list is `available`.
 */
export type SeatStatus = 'available' | 'taken' | 'held' | 'blocked';

/** A seat on hold, with the time that the hold runs out. */
export interface HeldSeat {
  key: SeatKey;
  /** The current viewer holds this seat. */
  mine?: boolean;
  /** ISO timestamp when the hold expires. */
  expiresAt?: string;
}

/** Occupancy snapshot of one session. A seat that is not listed is available. */
export interface Occupancy {
  /** Monotonic revision; a snapshot with a lower revision than the one shown is ignored. */
  revision: number | string;
  /** ISO server time, used to correct hold timers for clock skew. */
  serverNow?: string;
  taken?: SeatKey[];
  blocked?: SeatKey[];
  held?: HeldSeat[];
}

/**
 * An incremental change to an `Occupancy`: only the seats whose status changed. The revision rules
 * are the same as for `Occupancy`.
 */
export interface OccupancyDelta {
  revision: number | string;
  serverNow?: string;
  /** New status per seat; `available` removes the seat from every list. */
  changes: (
    { key: SeatKey; status: 'available' | 'taken' | 'blocked' } | ({ status: 'held' } & HeldSeat)
  )[];
}

/**
 * A price: a plain number of units with up to two decimals (`450`, `450.5`), no currency.
 * The same unit everywhere — hall config, session data, booking — so values never need converting.
 * Displayed with a neutral sign (`¤` by default), e.g. `450,50 ¤`.
 */
export type Price = number;

/**
 * Prices in plain units (see `Price`): one price per tier, and optional prices for single seats
 * that override their tier.
 */
export interface Pricing {
  /** Price per pricing tier. A section's tier defaults to its seat type id. */
  tiers: Record<string, Price>;
  /** Per-seat overrides. */
  seats?: Record<SeatKey, Price>;
}

/** Pseudonymous avatar data only: never send names or other personal data to every viewer. */
export interface AvatarInfo {
  /** Seed for deterministic appearance; defaults to the seat key. */
  seed?: string;
  color?: string;
  /** Opt-in by the host. Must be CORS-enabled to be used as a WebGL texture. */
  imageUrl?: string;
}
/** Avatars of the taken seats, by seat key. */
export type Avatars = Record<SeatKey, AvatarInfo>;

/**
 * What the screen shows: a still image, or a looping muted video. In WebGL only CORS-enabled URLs
 * can be drawn.
 */
export interface ScreenContent {
  /** Kind of media at `src`. */
  kind: 'image' | 'video';
  /** URL of the image or video. */
  src: string;
  /** Still frame shown before a video starts playing, and again if the video fails. */
  poster?: string;
}

/* ---------------------------------- selection ---------------------------------- */

/**
 * A selection rule that the selected seats break. `code` names the rule: `unknown` and
 * `unavailable` come from the checks that `validateSelection` runs first, and the other codes come
 * from the rules themselves. `keys` are the seats involved, and `params` carry numbers for the
 * message.
 */
export interface SelectionViolation {
  code: string;
  keys: SeatKey[];
  params?: Record<string, string | number>;
}

/**
 * What a selection rule sees: the selected keys without duplicates, the layout and its seat index,
 * and the status of any seat.
 */
export interface SelectionRuleContext {
  keys: readonly SeatKey[];
  layout: HallLayout;
  index: SeatIndex;
  /**
   * Status of a seat in the occupancy being checked. `available` when the occupancy does not list
   * the seat.
   */
  status(key: SeatKey): SeatStatus;
}

/**
 * A selection rule. It returns the violation, or `null` when the selection passes. Pass custom
 * rules to `validateSelection` next to the built-in `selectionRules`.
 */
export type SelectionRule = (ctx: SelectionRuleContext) => SelectionViolation | null;

/* ---------------------------------- booking ---------------------------------- */

/** Context of one booking attempt, passed to the host's booking callback. */
export interface BookContext {
  /** Same value for retries of the same selection: use it as an Idempotency-Key. */
  attemptId: string;
  /** Prices the viewer saw. The server compares, never trusts. */
  prices: { key: SeatKey; price: Price }[];
  signal: AbortSignal;
}

/**
 * Outcome of a booking attempt, as the host reports it. `ok: true` carries the host's `data`, and
 * optionally a hold. `conflict` lists the seats that could not be booked. `price_changed` means
 * prices must be shown again. `closed` means sales are shut. `error` may be retried when
 * `retryable` is set.
 */
export type BookResult<T = unknown> =
  | { ok: true; data: T; hold?: { expiresAt: string }; revision?: number | string }
  | { ok: false; reason: 'conflict'; keys: SeatKey[]; cause?: 'taken' | 'held' | 'unavailable' }
  | { ok: false; reason: 'price_changed' | 'closed' }
  | { ok: false; reason: 'error'; message?: string; retryable?: boolean };

/**
 * Result of saving a hall. `revision` is an opaque optimistic-locking token owned by the host
 * (etag, row
 * version, …): the constructor keeps the latest one and passes it back in the next save context.
 */
export type SaveResult =
  | { ok: true; baseline?: HallConfig; revision?: string | number }
  | {
      ok: false;
      reason: 'conflict';
      /** The current server version and, optionally, its YAML text and revision token. */
      server: HallConfig;
      source?: string;
      revision?: string | number;
    }
  | { ok: false; reason: 'invalid'; issues: Issue[] }
  | { ok: false; reason: 'seats_in_use'; keys: SeatKey[] };

/* ---------------------------------- helpers ---------------------------------- */

/** Builds a status lookup for an occupancy snapshot (O(1) per seat). */
export function createStatusLookup(occupancy: Occupancy | undefined): (key: SeatKey) => SeatStatus {
  if (!occupancy) return () => 'available';
  const map = new Map<SeatKey, SeatStatus>();
  for (const key of occupancy.taken ?? []) map.set(key, 'taken');
  for (const key of occupancy.blocked ?? []) map.set(key, 'blocked');
  for (const held of occupancy.held ?? []) map.set(held.key, 'held');
  return (key) => map.get(key) ?? 'available';
}

/** Price of a seat: per-seat override, then its tier. `null` when the host has no price for it. */
export function priceForSeat(
  pricing: Pricing | undefined,
  seat: Pick<Seat, 'key' | 'priceTier'>,
): Price | null {
  if (!pricing) return null;
  return ownPrice(pricing.seats, seat.key) ?? ownPrice(pricing.tiers, seat.priceTier) ?? null;
}

/**
 * Effective prices: the hall's base prices (`layout.pricing`) overridden tier by tier and seat by
 * seat
 * by the session's `pricing`. `undefined` when neither has prices.
 */
export function resolvePricing(
  base: Pricing | undefined,
  session: Pricing | undefined,
): Pricing | undefined {
  if (!base) return session;
  if (!session) return base;
  return {
    tiers: { ...base.tiers, ...session.tiers },
    ...(base.seats || session.seats ? { seats: { ...base.seats, ...session.seats } } : {}),
  };
}

/**
 * A price from a map, canonicalised to cents. Session data is host input and is not schema-checked,
 * so a negative or non-finite value counts as "no price" and `1.234` becomes `1.23` — the same
 * value
 * is then shown, summed and sent to booking.
 */
function ownPrice(map: Record<string, Price> | undefined, key: string): Price | undefined {
  if (!map || !Object.hasOwn(map, key)) return undefined;
  const value = map[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_PRICE) {
    return undefined;
  }
  return roundPrice(value);
}

/** Largest accepted price (same bound as the hall schema): keeps cents arithmetic exact. */
export const MAX_PRICE = 1_000_000_000;

/** Rounds a price to cents (two decimals). */
export function roundPrice(value: number): Price {
  return Math.round(value * 100) / 100;
}

/** Sum of prices, computed in cents to avoid float drift; `null` if any price is missing. */
export function sumPrices(values: readonly (Price | null)[]): Price | null {
  if (values.length === 0) return null;
  let cents = 0;
  for (const value of values) {
    if (value === null) return null;
    if (!Number.isFinite(value)) return null;
    cents += Math.round(value * 100);
  }
  return Number.isSafeInteger(cents) ? cents / 100 : null;
}

/** Neutral sign shown after prices when the host sets none ("generic currency"). */
export const DEFAULT_PRICE_SIGN = '¤';

/**
 * Formats a price with two decimals and a neutral sign: `formatPrice(450.5, 'en-US')` → `450.50 ¤`.
 * @param price - the amount in units (see `Price`).
 * @param locale - BCP 47 locale for the digits and separators; English (`en-US`) by default.
 * @param sign - the sign after the number; `''` shows the number only.
 */
export function formatPrice(
  price: Price,
  locale: string = 'en-US',
  sign: string = DEFAULT_PRICE_SIGN,
): string {
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
  return sign ? `${number}\u00a0${sign}` : number;
}
