/**
 * In-memory mock backend, modelled on docs/api.md §8:
 *   hall → hall_version (canonical JSON + manifest) → session (pinned to one version) → seat state.
 *
 * Server-only. Imported by route handlers, Server Actions and Server Components, never by client
 * files. (The `server-only` package is not a dependency of this demo, so this is a convention.)
 *
 * The state lives on `globalThis`, so every route and action in one server process shares it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildHallLayout,
  buildSeatManifest,
  parseHallConfig,
  type BookResult,
  type HallConfig,
  type HallLayout,
  type Pricing,
  type SeatKey,
  type SeatManifest,
} from '@cinema-hall/core';
import { addDays, sessionIdOf, todayIso } from '@/lib/shared/generator';
import type { ShowtimeChip } from '@/lib/shared/types';

/** A hold lasts this long unless the viewer books again (api.md §8: host owns hold expiry). */
export const HOLD_TTL_MS = 10 * 60 * 1000;

/** Share of seats taken in a session unless the generator says otherwise. */
export const DEFAULT_TAKEN_PERCENT = 40;

/** Bounds of the in-memory backend. The routes answer 409 past them. */
export const MAX_HALLS = 40;
export const MAX_SESSIONS_TOTAL = 1500;

/** The hall that the constructor opens when `?hall` is absent. */
export const HALL_ID = 'orbita-hall-2';
export const CINEMA_NAME = 'Orbita';

/**
 * Session price overrides. Base prices live in the hall config (`pricing.tiers`, set in the
 * constructor); a session may override tiers with the same plain units (api.md §2.6).
 */
export function sessionPricing(session: SessionRecord): Pricing | undefined {
  return session.pricing;
}

interface PresetSession {
  /** Days after the day the server started. */
  day: 1 | 2;
  time: string;
  format: string;
  pricing?: Pricing;
  /** Fixed id; the others follow `${hallId}-${yyyymmdd}-${hhmm}`. */
  id?: string;
}

interface Preset {
  file: string;
  sessions: readonly PresetSession[];
}

/** Halls that exist at start-up, each with sessions on two dates. LUX / premium sessions cost more. */
const PRESETS: readonly Preset[] = [
  {
    file: 'orbita-hall-2.yaml',
    sessions: [
      { day: 1, time: '16:10', format: '2D', id: 'sat-1610' },
      {
        day: 1,
        time: '18:40',
        format: 'LUX',
        id: 'sat-1840',
        pricing: { tiers: { standard: 550, recliner: 800 } },
      },
      { day: 1, time: '21:20', format: '2D', id: 'sat-2120' },
      { day: 2, time: '12:30', format: '2D' },
    ],
  },
  {
    file: 'kamerny-hall.yaml',
    sessions: [
      { day: 1, time: '14:00', format: '2D' },
      { day: 1, time: '19:30', format: '2D' },
      { day: 2, time: '11:00', format: '2D' },
      {
        day: 2,
        time: '20:15',
        format: 'Premiere',
        pricing: { tiers: { standard: 450, sofa: 650 } },
      },
    ],
  },
  {
    file: 'bolshoy-hall.yaml',
    sessions: [
      { day: 1, time: '12:00', format: '2D' },
      {
        day: 1,
        time: '17:40',
        format: 'LUX',
        pricing: { tiers: { standard: 600, recliner: 980, balcony: 520 } },
      },
      { day: 2, time: '15:20', format: '2D' },
      {
        day: 2,
        time: '21:00',
        format: 'LUX',
        pricing: { tiers: { standard: 600, recliner: 980, balcony: 520 } },
      },
    ],
  },
];

export interface HallVersion {
  id: string;
  hallId: string;
  rev: number;
  /**
   * The validated config, kept as an object. It is never re-read from text: the canonical JSON of a
   * valid config can be larger than the parser's input limit, so a stored text could not be parsed
   * back. Nothing may change it after the version is made.
   */
  config: HallConfig;
  /** The YAML the revision was saved from; keeps the comments for the constructor. */
  source: string;
  manifest: SeatManifest;
  /** Built together with the version, so reading a layout can never fail later. */
  layout: HallLayout;
  createdAt: string;
}

export interface HallRecord {
  id: string;
  name: string;
  cinema?: string;
  /** Ids of the versions, oldest first. */
  versionIds: string[];
  currentVersionId: string;
}

export interface Hold {
  id: string;
  viewerId: string;
  keys: SeatKey[];
  /** Epoch milliseconds. */
  expiresAt: number;
}

export interface SessionRecord {
  id: string;
  hallId: string;
  /** The hall version the session is pinned to (api.md §8). */
  hallVersionId: string;
  /** ISO calendar date, `YYYY-MM-DD`. */
  date: string;
  /** `HH:MM`. */
  time: string;
  /** Free label of the showing, for example `2D` or `LUX`. */
  format: string;
  /** Tier prices of this session; tiers that are absent use the hall prices. */
  pricing?: Pricing;
  /** Share of seats that are already taken, 0 to 100 (the mock's seeded occupancy). */
  occupancyPercent: number;
  /** Monotonic; bumped on every change of the seat state. */
  revision: number;
  /** Seat key → the hold that covers it. */
  holds: Map<SeatKey, Hold>;
  /** `${viewerId}|${attemptId}` → the first result, so retries are idempotent. */
  attempts: Map<string, BookResult>;
  /** Seeded taken seats, computed on first use. */
  seedTaken: Set<SeatKey> | null;
}

interface MockDb {
  halls: Map<string, HallRecord>;
  versions: Map<string, HallVersion>;
  sessions: Map<string, SessionRecord>;
}

interface GlobalStore {
  __cinemaHallDemoDb2?: MockDb;
}

export function db(): MockDb {
  const holder = globalThis as typeof globalThis & GlobalStore;
  const existing = holder.__cinemaHallDemoDb2;
  if (existing) return existing;
  const created = seed();
  holder.__cinemaHallDemoDb2 = created;
  return created;
}

/**
 * Builds a version from a validated config. Everything that can fail (manifest, layout) happens
 * here, before the caller stores anything.
 */
export function makeVersion(
  hallId: string,
  rev: number,
  config: HallConfig,
  source: string,
): HallVersion {
  return {
    id: `${hallId}@${rev}`,
    hallId,
    rev,
    config,
    source,
    manifest: buildSeatManifest(config),
    layout: buildHallLayout(config),
    createdAt: new Date().toISOString(),
  };
}

export function makeSession(
  hall: HallRecord,
  spec: {
    id: string;
    date: string;
    time: string;
    format: string;
    pricing?: Pricing;
    occupancyPercent: number;
  },
): SessionRecord {
  return {
    id: spec.id,
    hallId: hall.id,
    hallVersionId: hall.currentVersionId,
    date: spec.date,
    time: spec.time,
    format: spec.format,
    ...(spec.pricing ? { pricing: spec.pricing } : {}),
    occupancyPercent: spec.occupancyPercent,
    revision: 1,
    holds: new Map(),
    attempts: new Map(),
    seedTaken: null,
  };
}

function seed(): MockDb {
  const state: MockDb = {
    halls: new Map(),
    versions: new Map(),
    sessions: new Map(),
  };
  const today = todayIso();
  for (const preset of PRESETS) {
    const source = readFileSync(join(process.cwd(), 'data', preset.file), 'utf8');
    const { config } = parseHallConfig(source, { format: 'yaml', strict: true });
    const hallId = config.id ?? preset.file.replace(/\.yaml$/, '');
    const version = makeVersion(hallId, 1, config, source);
    const hall: HallRecord = {
      id: hallId,
      name: config.name,
      cinema: CINEMA_NAME,
      versionIds: [version.id],
      currentVersionId: version.id,
    };
    state.halls.set(hall.id, hall);
    state.versions.set(version.id, version);
    for (const entry of preset.sessions) {
      const date = addDays(today, entry.day);
      const id = entry.id ?? sessionIdOf(hallId, date, entry.time);
      state.sessions.set(
        id,
        makeSession(hall, {
          id,
          date,
          time: entry.time,
          format: entry.format,
          ...(entry.pricing ? { pricing: entry.pricing } : {}),
          occupancyPercent: DEFAULT_TAKEN_PERCENT,
        }),
      );
    }
  }
  return state;
}

export function allHalls(): HallRecord[] {
  return [...db().halls.values()];
}

export function findSession(sessionId: string): SessionRecord | undefined {
  return db().sessions.get(sessionId);
}

export function findHall(hallId: string): HallRecord | undefined {
  return db().halls.get(hallId);
}

export function findVersion(versionId: string): HallVersion | undefined {
  return db().versions.get(versionId);
}

export function currentVersionOf(hall: HallRecord): HallVersion | undefined {
  return findVersion(hall.currentVersionId);
}

/** Start of a session in epoch milliseconds, in the time zone of the server. */
export function sessionStartMs(session: Pick<SessionRecord, 'date' | 'time'>): number {
  const [year, month, day] = session.date.split('-').map(Number);
  const [hours, minutes] = session.time.split(':').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, hours ?? 0, minutes ?? 0).getTime();
}

/** Sessions of one hall, earliest first. */
export function sessionsOfHall(hallId: string): SessionRecord[] {
  return [...db().sessions.values()]
    .filter((session) => session.hallId === hallId)
    .sort((a, b) => sessionStartMs(a) - sessionStartMs(b) || a.id.localeCompare(b.id));
}

/** The layout of a version, built when the version was made. */
export function layoutOf(versionId: string): HallLayout | undefined {
  return db().versions.get(versionId)?.layout;
}

/** Seats that other people bought before the viewer arrived: `occupancyPercent` of the hall. */
export function seededTaken(session: SessionRecord, layout: HallLayout): Set<SeatKey> {
  if (session.seedTaken) return session.seedTaken;
  const taken = new Set<SeatKey>(
    layout.seats
      .filter((seat) => fnv1a(`${session.id}|${seat.key}`) % 100 < session.occupancyPercent)
      .map((seat) => seat.key),
  );
  session.seedTaken = taken;
  return taken;
}

/** Drops expired holds. Each removal is a change of the seat state, so it bumps the revision. */
export function pruneExpired(session: SessionRecord, now: number): void {
  let removed = false;
  for (const hold of new Set(session.holds.values())) {
    if (hold.expiresAt > now) continue;
    for (const key of hold.keys) {
      if (session.holds.get(key) === hold) session.holds.delete(key);
    }
    removed = true;
  }
  if (removed) session.revision += 1;
}

export interface SessionPage {
  config: HallConfig;
  /** Revision of the hall version the session is pinned to. */
  versionRev: number;
  cinema?: string;
  hallName: string;
  dateLabel: string;
  format: string;
  /** Sessions of the same hall on the same date, earliest first (the session itself included). */
  showtimes: ShowtimeChip[];
}

export function getSessionPage(sessionId: string): SessionPage | undefined {
  const session = findSession(sessionId);
  if (!session) return undefined;
  const version = findVersion(session.hallVersionId);
  if (!version) return undefined;
  const hall = findHall(session.hallId);
  if (!hall) return undefined;
  return {
    config: version.config,
    versionRev: version.rev,
    ...(hall.cinema ? { cinema: hall.cinema } : {}),
    hallName: hall.name,
    dateLabel: dateLabel(session.date),
    format: session.format,
    showtimes: sessionsOfHall(hall.id)
      .filter((other) => other.date === session.date)
      .map((other) => ({ id: other.id, time: other.time, format: other.format })),
  };
}

/** `Sat, November 22`: the weekday and date in US English. */
export function dateLabel(date: string): string {
  return formatDate(date, { weekday: 'short', day: 'numeric', month: 'long' });
}

/** `Nov 22`. */
export function dateShort(date: string): string {
  return formatDate(date, { day: 'numeric', month: 'short' });
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions): string {
  const [year, month, day] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(utc);
}

/** FNV-1a, 32-bit: a small deterministic hash for the seeded seat states. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
