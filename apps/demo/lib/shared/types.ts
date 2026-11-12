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
  /** English message from `formatIssue`. */
  text: string;
  /** `line 3, column 7` for syntax errors; empty otherwise. */
  position: string;
  /** Config path, `layout.bands[0].sections[1].seatsPerRow`; empty for the whole document. */
  path: string;
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
  occupancyPercent: number;
  /** Effective price of each tier: hall price with the session's overrides applied. */
  prices: { tier: string; label: string; price: Price | null; overridden: boolean }[];
}

/** A hall as the home page and the constructor show it. */
export interface HallCard {
  id: string;
  name: string;
  cinema?: string;
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
}

export type CreateHallResponse =
  | { ok: true; hall: HallCard; created: number; skipped: number }
  | { ok: false; error: string; message: string; issues?: IssueView[]; field?: string };

export type SessionsResponse =
  | { ok: true; sessions: SessionView[]; created: number; skipped: number }
  | { ok: false; error: string; message: string; field?: string };

export interface RepinResult {
  ok: true;
  /** Revision the sessions were moved to. */
  toRev: number;
  moved: { sessionId: string; fromRev: number }[];
  /** Sessions kept on their version because a seat that the new version removes is in use. */
  refused: { sessionId: string; keys: SeatKey[] }[];
  /** Sessions that were already on that version, or that have already started. */
  unchanged: number;
}

export type RepinResponse = RepinResult | { ok: false; error: string; message: string };

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
    optional(value.pricing, isPricingShape)
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
    isString(value.path)
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
    return isHallCard(value.hall) && isNumber(value.created) && isNumber(value.skipped);
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
  return isRecord(value) && isString(value.sessionId) && isStringArray(value.keys);
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
