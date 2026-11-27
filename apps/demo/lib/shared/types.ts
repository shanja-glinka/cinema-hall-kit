/**
 * Wire types shared by the route handlers and the client components.
 * Nothing here imports server code: client files may import this module.
 */
import type { HallConfig, Occupancy, Price, Pricing, SaveResult, SeatKey } from '@cinema-hall/core';

export interface OccupancyResponse {
  occupancy: Occupancy;
  /** Revision of the hall version the session is pinned to; it changes when the session is re-pinned. */
  hallVersionRev: number;
  /** Session price overrides; absent when the hall prices apply as they are. */
  pricing?: Pricing;
  /**
   * The asking viewer's own active reservations (by the viewer cookie), so a reopened page can
   * restore its reservation, the countdown and the purchase step. Absent when there are none.
   */
  ownHolds?: OwnHold[];
  /**
   * The tickets the asking viewer bought for this showtime, latest first, each with the reservation
   * it was bought through. The page shows a ticket from here, so a purchase whose answer was lost (a
   * dropped connection, a reload while it was on its way) still shows its ticket once it went
   * through. Absent when there are none.
   */
  ownTickets?: OwnTicket[];
}

/** A ticket of the asking viewer and the reservation it was bought through. */
export interface OwnTicket {
  holdId: string;
  ticket: Ticket;
}

/** One active reservation of the asking viewer. */
export interface OwnHold {
  holdId: string;
  keys: SeatKey[];
  /** ISO time the reservation ends. */
  expiresAt: string;
}

/** The hall config a session is pinned to, for a page that has to redraw after a re-pin. */
export interface SessionConfigResponse {
  sessionId: string;
  hallVersionRev: number;
  config: HallConfig;
}

export interface HallResponse {
  hallId: string;
  /** Revision of the current hall version; the constructor sends it back as `baseRevision`. */
  revision: number;
  config: HallConfig;
  /** The last saved YAML, with its comments. */
  source: string;
}

/** `SaveResult` plus the revision the server holds after the call. */
export type HallSaveResponse = SaveResult & { revision: number };

/** A showtime chip on the booking page: another session of the same hall on the same date. */
export interface ShowtimeChip {
  id: string;
  time: string;
  format: string;
}

/** A validation issue as text, ready to show. Built by `toIssueView` on either side of the wire. */
export interface IssueView {
  severity: 'error' | 'warning';
  code: string;
  /** Message from `formatIssue` (`toIssueView`). */
  text: string;
  /** `line 3, column 7` for syntax errors; empty otherwise. */
  position: string;
  /** Config path, `layout.bands[0].sections[1].seatsPerRow`; empty for the whole document. */
  path: string;
  /** Where the issue is, in words: `Seating area 1 › section 2 › seats per row`. */
  place?: string;
}

/** A price tier of a hall: the seats that share a price. */
export interface TierView {
  tier: string;
  label: string;
  /** Seats in this tier. */
  count: number;
  /** Colour of the first seat of the tier. */
  color: string;
  /** Base price from the hall config; `null` when the hall has none. */
  price: Price | null;
}

export interface SessionView {
  id: string;
  hallId: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** `Sat, November 22`. */
  dateLabel: string;
  /** `Nov 22`. */
  dateShort: string;
  time: string;
  format: string;
  /** Revision of the hall version the session is pinned to. */
  versionRev: number;
  /** Seats in the hall version the session is pinned to. */
  seats?: number;
  occupancyPercent: number;
  /** Effective price of each tier: hall price with the session's overrides applied. */
  prices: { tier: string; label: string; price: Price | null; overridden: boolean }[];
}

/** A hall as the home page and the constructor show it. */
export interface HallCard {
  id: string;
  name: string;
  cinema?: string;
  /** A hall the demo started with. Saving over it is protected: the constructor offers a copy. */
  sample?: boolean;
  currentRev: number;
  seats: number;
  tiers: TierView[];
  sessions: SessionView[];
  /** Future sessions that are pinned to an older version than the current one. */
  outdatedSessions: number;
}

/** Input of the session generator, as it arrives over the wire (strings or numbers). */
export interface GeneratorInput {
  /** `YYYY-MM-DD`, inclusive. */
  from: string;
  to: string;
  slots: { time: string; format: string }[];
  /** Tier → price override. Empty strings and tiers equal to the hall price are ignored. */
  prices?: Record<string, string | number>;
  occupancyPercent?: string | number;
}

export interface CreateHallBody {
  yaml: string;
  cinema?: string;
  generator?: GeneratorInput;
  /** A name for the new hall; replaces the name written in `yaml`. */
  name?: string;
  /**
   * A new hall made in the constructor (a template, a copy, "Save as new hall"): the id is made from
   * the name and the `id` written in `yaml` is ignored, and the header comment names the new hall.
   */
  asNew?: boolean;
}

export type CreateHallResponse =
  | {
      ok: true;
      hall: HallCard;
      created: number;
      skipped: number;
      /** The id written in the document when the hall got another one (it was taken, or `asNew`). */
      requestedId?: string;
      /**
       * The hall as it was stored: its config, YAML text (with the id and header it got) and
       * revision. The constructor switches to the new hall with exactly this, without a second
       * request that could fail.
       */
      stored: HallResponse;
    }
  | { ok: false; error: string; message: string; issues?: IssueView[]; field?: string };

export type SessionsResponse =
  | { ok: true; sessions: SessionView[]; created: number; skipped: number }
  | { ok: false; error: string; message: string; field?: string };

/** Answer of `DELETE /api/halls/[hallId]/sessions/[sessionId]`. */
export type DeleteSessionResponse = { ok: true } | { ok: false; error: string; message: string };

export interface RepinResult {
  ok: true;
  /** Revision the sessions were moved to. */
  toRev: number;
  moved: { sessionId: string; fromRev: number }[];
  /**
   * Sessions kept on their version because a seat that the new version removes is in use. `showtime`
   * names the session (`Nov 28 · 18:30`) and `seats` gives the seat labels (`Q7`) of `keys`.
   */
  refused: {
    sessionId: string;
    keys: SeatKey[];
    showtime?: string;
    seats?: string[];
    /**
     * `true` when every seat in the way is only held for a while (no seat is sold): once those holds
     * end, moving the showtime again can succeed. Absent or `false` when a sold seat is in the way.
     */
    retryable?: boolean;
  }[];
  /** Sessions that were already on that version, or that have already started. */
  unchanged: number;
}

export type RepinResponse = RepinResult | { ok: false; error: string; message: string };

/** A demo ticket: the seats of a hold, now sold to the viewer. No payment is involved. */
export interface Ticket {
  /** Ticket number shown to the viewer, `T-1A2B3C4D`. */
  number: string;
  sessionId: string;
  keys: SeatKey[];
  /** Seat labels, `B4`, in the order of `keys`. */
  seats: string[];
  /** Sum of the seat prices of the showtime; `null` when a seat has no price. */
  total: Price | null;
  /** ISO time of the purchase. */
  purchasedAt: string;
}

export type PurchaseResult =
  | { ok: true; ticket: Ticket }
  | {
      ok: false;
      /** `expired`: the hold ran out; `not_found`: no such hold of this viewer; `closed`: no showtime. */
      reason: 'expired' | 'not_found' | 'closed' | 'bad_request';
      message: string;
    }
  | {
      ok: false;
      /**
       * The price of the seats is not the one the viewer confirmed (the hall or the showtime prices
       * changed since). Nothing was sold or released; `total` is the new total of the seats.
       */
      reason: 'price_changed';
      total: Price | null;
      message: string;
    }
  | {
      ok: false;
      /** Buying only the chosen seats would break a selection rule; nothing was sold or released. */
      reason: 'selection_rule';
      /** Code of the broken rule, for example `noSingleGap`. */
      rule: string;
      message: string;
    };

// ---- guards for JSON that arrives over the network ----
//
// Each guard checks the discriminant and every field its consumers read, so a value that passes can
// be used without further checks. They are strict on purpose: the TypeScript declarations above do
// not prove anything about parsed network data.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString);
const isArrayOf = <T>(value: unknown, guard: (item: unknown) => item is T): value is T[] =>
  Array.isArray(value) && value.every(guard);
const optional = <T>(value: unknown, guard: (item: unknown) => item is T): boolean =>
  value === undefined || guard(value);

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(isNumber);
}

function isPricingShape(value: unknown): value is Pricing {
  return isRecord(value) && isNumberRecord(value.tiers) && optional(value.seats, isNumberRecord);
}

function isHeldSeat(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.key) &&
    (value.mine === undefined || typeof value.mine === 'boolean') &&
    optional(value.expiresAt, isString)
  );
}

function isOccupancyShape(value: unknown): value is Occupancy {
  return (
    isRecord(value) &&
    (isNumber(value.revision) || isString(value.revision)) &&
    optional(value.serverNow, isString) &&
    (value.taken === undefined || isStringArray(value.taken)) &&
    (value.blocked === undefined || isStringArray(value.blocked)) &&
    (value.held === undefined || (Array.isArray(value.held) && value.held.every(isHeldSeat)))
  );
}

export function isOccupancyResponse(value: unknown): value is OccupancyResponse {
  return (
    isRecord(value) &&
    isOccupancyShape(value.occupancy) &&
    isNumber(value.hallVersionRev) &&
    optional(value.pricing, isPricingShape) &&
    optional(value.ownHolds, isOwnHoldList) &&
    optional(value.ownTickets, isOwnTicketList)
  );
}

function isOwnTicketList(value: unknown): value is OwnTicket[] {
  return (
    Array.isArray(value) &&
    value.every((item) => isRecord(item) && isString(item.holdId) && isTicket(item.ticket))
  );
}

function isOwnHoldList(value: unknown): value is OwnHold[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        isString(item.holdId) &&
        isStringArray(item.keys) &&
        isString(item.expiresAt),
    )
  );
}

function isHallConfigShape(value: unknown): value is HallConfig {
  // The server sends a parsed config; the full structure is checked where the config is used.
  return isRecord(value) && isString(value.name);
}

export function isSessionConfigResponse(value: unknown): value is SessionConfigResponse {
  return (
    isRecord(value) &&
    isString(value.sessionId) &&
    isNumber(value.hallVersionRev) &&
    isHallConfigShape(value.config)
  );
}

export function isHallResponse(value: unknown): value is HallResponse {
  return (
    isRecord(value) &&
    isString(value.hallId) &&
    isNumber(value.revision) &&
    isString(value.source) &&
    isHallConfigShape(value.config)
  );
}

const isPathElement = (value: unknown): value is string | number =>
  isString(value) || isNumber(value);

function isParams(value: unknown): boolean {
  return (
    isRecord(value) && Object.values(value).every((entry) => isString(entry) || isNumber(entry))
  );
}

function isStringRecord(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every(isString);
}

function isPosition(value: unknown): boolean {
  return isRecord(value) && isNumber(value.line) && isNumber(value.col);
}

/** A core `Issue` as the constructor reads it: every field it touches is checked here. */
function isIssueShape(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.severity === 'error' || value.severity === 'warning') &&
    isString(value.code) &&
    isArrayOf(value.path, isPathElement) &&
    (value.params === undefined || isParams(value.params)) &&
    (value.ref === undefined || isStringRecord(value.ref)) &&
    (value.position === undefined || isPosition(value.position))
  );
}

export function isSaveResponse(value: unknown): value is HallSaveResponse {
  if (!isRecord(value) || !isNumber(value.revision)) return false;
  if (value.ok === true) return value.baseline === undefined || isHallConfigShape(value.baseline);
  if (value.ok !== false) return false;
  switch (value.reason) {
    case 'conflict':
      return isHallConfigShape(value.server) && optional(value.source, isString);
    case 'invalid':
      return Array.isArray(value.issues) && value.issues.every(isIssueShape);
    case 'seats_in_use':
      return isStringArray(value.keys);
    default:
      return false;
  }
}

export function isHoldData(value: unknown): value is { holdId: string } {
  return isRecord(value) && isString(value.holdId);
}

function isIssueView(value: unknown): value is IssueView {
  return (
    isRecord(value) &&
    (value.severity === 'error' || value.severity === 'warning') &&
    isString(value.code) &&
    isString(value.text) &&
    isString(value.position) &&
    isString(value.path) &&
    optional(value.place, isString)
  );
}

function isTierView(value: unknown): value is TierView {
  return (
    isRecord(value) &&
    isString(value.tier) &&
    isString(value.label) &&
    isNumber(value.count) &&
    isString(value.color) &&
    (value.price === null || isNumber(value.price))
  );
}

function isPriceView(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.tier) &&
    isString(value.label) &&
    (value.price === null || isNumber(value.price)) &&
    typeof value.overridden === 'boolean'
  );
}

export function isSessionView(value: unknown): value is SessionView {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.hallId) &&
    isString(value.date) &&
    isString(value.dateLabel) &&
    isString(value.dateShort) &&
    isString(value.time) &&
    isString(value.format) &&
    isNumber(value.versionRev) &&
    optional(value.seats, isNumber) &&
    isNumber(value.occupancyPercent) &&
    Array.isArray(value.prices) &&
    value.prices.every(isPriceView)
  );
}

export function isHallCard(value: unknown): value is HallCard {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    optional(value.cinema, isString) &&
    optional(value.sample, isBoolean) &&
    isNumber(value.currentRev) &&
    isNumber(value.seats) &&
    isArrayOf(value.tiers, isTierView) &&
    isArrayOf(value.sessions, isSessionView) &&
    isNumber(value.outdatedSessions)
  );
}

export function isSessionsList(value: unknown): value is { sessions: SessionView[] } {
  return isRecord(value) && isArrayOf(value.sessions, isSessionView);
}

function isFailureShape(value: Record<string, unknown>): boolean {
  return isString(value.error) && isString(value.message) && optional(value.field, isString);
}

export function isCreateHallResponse(value: unknown): value is CreateHallResponse {
  if (!isRecord(value)) return false;
  if (value.ok === true) {
    return (
      isHallCard(value.hall) &&
      isNumber(value.created) &&
      isNumber(value.skipped) &&
      optional(value.requestedId, isString) &&
      isHallResponse(value.stored)
    );
  }
  return value.ok === false && isFailureShape(value) && optional(value.issues, isIssueViews);
}

function isIssueViews(value: unknown): value is IssueView[] {
  return isArrayOf(value, isIssueView);
}

export function isSessionsResponse(value: unknown): value is SessionsResponse {
  if (!isRecord(value)) return false;
  if (value.ok === true) {
    return (
      isArrayOf(value.sessions, isSessionView) && isNumber(value.created) && isNumber(value.skipped)
    );
  }
  return value.ok === false && isFailureShape(value);
}

function isRefusal(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.sessionId) &&
    isStringArray(value.keys) &&
    optional(value.showtime, isString) &&
    optional(value.seats, isStringArray) &&
    optional(value.retryable, isBoolean)
  );
}

function isMove(value: unknown): boolean {
  return isRecord(value) && isString(value.sessionId) && isNumber(value.fromRev);
}

export function isRepinResponse(value: unknown): value is RepinResponse {
  if (!isRecord(value)) return false;
  if (value.ok === true) {
    return (
      isNumber(value.toRev) &&
      Array.isArray(value.moved) &&
      value.moved.every(isMove) &&
      Array.isArray(value.refused) &&
      value.refused.every(isRefusal) &&
      isNumber(value.unchanged)
    );
  }
  return value.ok === false && isFailureShape(value);
}

function isTicket(value: unknown): value is Ticket {
  return (
    isRecord(value) &&
    isString(value.number) &&
    isString(value.sessionId) &&
    isStringArray(value.keys) &&
    isStringArray(value.seats) &&
    (value.total === null || isNumber(value.total)) &&
    isString(value.purchasedAt)
  );
}

export function isPurchaseResult(value: unknown): value is PurchaseResult {
  if (!isRecord(value)) return false;
  if (value.ok === true) return isTicket(value.ticket);
  return (
    value.ok === false &&
    (value.reason === 'expired' ||
      value.reason === 'not_found' ||
      value.reason === 'closed' ||
      value.reason === 'bad_request' ||
      (value.reason === 'price_changed' && (value.total === null || isNumber(value.total))) ||
      (value.reason === 'selection_rule' && isString(value.rule))) &&
    isString(value.message)
  );
}

export function isDeleteSessionResponse(value: unknown): value is DeleteSessionResponse {
  if (!isRecord(value)) return false;
  if (value.ok === true) return true;
  return value.ok === false && isFailureShape(value);
}
