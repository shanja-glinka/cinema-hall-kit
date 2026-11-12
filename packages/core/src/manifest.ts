import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { buildHallLayout, type Seat, type SeatKey } from './layout.js';
import type { HallConfig, Meta } from './schema.js';

/**
 * One seat in a manifest: its identity, label and position in metres. The field names are part of
 * the manifest format.
 */
export interface SeatManifestEntry {
  key: SeatKey;
  label: string;
  row: string;
  number: number;
  sectionId: string;
  seatTypeId: string;
  priceTier: string;
  /** X position in metres, as the layout rounds it (to a micrometre). */
  x: number;
  /**
   * Floor height of the seat's row (rake). Part of `geometryHash`. Absent in manifests stored
   * before the field existed; the builder always fills it.
   */
  y?: number;
  /** Z position in metres. */
  z: number;
  /** Global 0-based row index. */
  rowIndex: number;
  /** 0-based column within the band row, counting excluded positions. */
  col: number;
}

/**
 * A compact, versioned list of every seat of a hall, for seat pickers and booking servers. Two
 * hashes identify it: `seatSetHash` changes when seats are added, removed, relabelled or retyped,
 * and `geometryHash` changes when a seat moves (compared at millimetre resolution).
 */
export interface SeatManifest {
  /** Version of the manifest format. `1` today. */
  manifestVersion: 1;
  /** `schemaVersion` of the layout the manifest was built from. */
  schemaVersion: number;
  /** Id of the config, when the config has one. */
  hallId?: string;
  /** Root `meta` of the config. Not part of either hash. */
  meta?: Meta;
  /** Hall box `meta` of the config. Not part of either hash. */
  hall?: { meta?: Meta };
  /**
   * Seat types by id. Not part of either hash. The builder always fills it; optional so that
   * values written before the field existed still type-check.
   */
  seatTypes?: Record<string, { label: string; meta?: Meta }>;
  /**
   * Sections by id, with their band. Not part of either hash. The builder always fills it; see
   * `seatTypes`.
   */
  sections?: Record<string, { bandId: string; meta?: Meta }>;
  /** Bands by id. Not part of either hash. The builder always fills it; see `seatTypes`. */
  bands?: Record<string, { meta?: Meta }>;
  /** sha256 of canonical JSON of keys + labels + seat types + price tiers. */
  seatSetHash: string;
  /** sha256 of seat positions rounded to millimetres. */
  geometryHash: string;
  /** Every seat, in layout order: row by row, left to right. */
  seats: SeatManifestEntry[];
}

/** What changed between two manifests, seat by seat (see `diffSeatManifests`). */
export interface ManifestDiff {
  /** Seats that are only in the next manifest. */
  added: SeatKey[];
  /** Seats that are only in the previous manifest. */
  removed: SeatKey[];
  /**
   * Seats whose position changed at millimetre resolution (the resolution of `geometryHash`).
   * `dy` is 0 when the floor did not change, or when a stored manifest has no floor height.
   */
  moved: { key: SeatKey; dx: number; dy?: number; dz: number }[];
  /** Seats whose label changed, with the old and the new label. */
  relabelled: { key: SeatKey; from: string; to: string }[];
  /** Seats whose seat type or price tier changed. */
  retyped: SeatKey[];
}

/** JSON with recursively sorted object keys and no whitespace. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const members = Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${members.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const hashOf = (value: unknown): string =>
  `sha256:${bytesToHex(sha256(utf8ToBytes(canonicalJson(value))))}`;
const millimetres = (metres: number): number => Math.round(metres * 1000);
const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

function bySeatKey(a: Seat, b: Seat): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/**
 * Builds the manifest of a structurally valid config (see `parseHallConfig`). The same config
 * always gives the same output and hashes. `meta` is copied, but it is not part of either hash.
 *
 * @example
 * ```ts
 * const manifest = buildSeatManifest(config);
 * console.log(manifest.seats.length, manifest.seatSetHash);
 * ```
 */
export function buildSeatManifest(config: HallConfig): SeatManifest {
  const layout = buildHallLayout(config);
  const sorted = [...layout.seats].sort(bySeatKey);
  return {
    manifestVersion: 1,
    schemaVersion: layout.schemaVersion,
    ...(config.id !== undefined ? { hallId: config.id } : {}),
    ...(config.meta !== undefined ? { meta: config.meta } : {}),
    ...(config.hall.meta !== undefined ? { hall: { meta: config.hall.meta } } : {}),
    seatTypes: Object.fromEntries(
      Object.entries(config.seatTypes).map(([id, seatType]) => [
        id,
        { label: seatType.label, ...(seatType.meta !== undefined ? { meta: seatType.meta } : {}) },
      ]),
    ),
    sections: Object.fromEntries(
      config.layout.bands.flatMap((band) =>
        band.sections.map((section) => [
          section.id,
          { bandId: band.id, ...(section.meta !== undefined ? { meta: section.meta } : {}) },
        ]),
      ),
    ),
    bands: Object.fromEntries(
      config.layout.bands.map((band): [string, { meta?: Meta }] => [
        band.id,
        band.meta !== undefined ? { meta: band.meta } : {},
      ]),
    ),
    seatSetHash: hashOf(
      sorted.map((seat) => [seat.key, seat.label, seat.seatTypeId, seat.priceTier]),
    ),
    geometryHash: hashOf(
      sorted.map((seat) => [
        seat.key,
        millimetres(seat.position.x),
        millimetres(seat.position.y),
        millimetres(seat.position.z),
      ]),
    ),
    seats: layout.seats.map((seat) => ({
      key: seat.key,
      label: seat.label,
      row: seat.row,
      number: seat.number,
      sectionId: seat.sectionId,
      seatTypeId: seat.seatTypeId,
      priceTier: seat.priceTier,
      x: seat.position.x,
      y: seat.position.y,
      z: seat.position.z,
      rowIndex: seat.rowIndex,
      col: seat.col,
    })),
  };
}

/**
 * Floor height change of a seat (metres, rounded), or `undefined` when the floor did not change at
 * millimetre resolution. Manifests stored before `y` existed have no floor height; then the floor
 * is not compared (x and z still are).
 */
function floorDelta(before: SeatManifestEntry, after: SeatManifestEntry): number | undefined {
  if (typeof before.y !== 'number' || typeof after.y !== 'number') return undefined;
  return millimetres(before.y) !== millimetres(after.y) ? round6(after.y - before.y) : undefined;
}

/**
 * Compares two manifests seat by seat. A seat that moved is listed in `moved` with its change in
 * metres (`dx`, `dy`, `dz`, rounded to a micrometre). Movement is compared at millimetre
 * resolution, like `geometryHash`, so smaller changes are not reported.
 */
export function diffSeatManifests(prev: SeatManifest, next: SeatManifest): ManifestDiff {
  const before = new Map<SeatKey, SeatManifestEntry>(
    prev.seats.map((seat): [SeatKey, SeatManifestEntry] => [seat.key, seat]),
  );
  const after = new Map<SeatKey, SeatManifestEntry>(
    next.seats.map((seat): [SeatKey, SeatManifestEntry] => [seat.key, seat]),
  );
  const diff: ManifestDiff = { added: [], removed: [], moved: [], relabelled: [], retyped: [] };
  for (const seat of next.seats) {
    const old = before.get(seat.key);
    if (!old) {
      diff.added.push(seat.key);
      continue;
    }
    const dy = floorDelta(old, seat);
    const moved =
      millimetres(seat.x) !== millimetres(old.x) ||
      millimetres(seat.z) !== millimetres(old.z) ||
      dy !== undefined;
    if (moved) {
      diff.moved.push({
        key: seat.key,
        dx: round6(seat.x - old.x),
        dy: dy ?? 0,
        dz: round6(seat.z - old.z),
      });
    }
    if (old.label !== seat.label)
      diff.relabelled.push({ key: seat.key, from: old.label, to: seat.label });
    if (old.seatTypeId !== seat.seatTypeId || old.priceTier !== seat.priceTier)
      diff.retyped.push(seat.key);
  }
  for (const seat of prev.seats) {
    if (!after.has(seat.key)) diff.removed.push(seat.key);
  }
  return diff;
}
