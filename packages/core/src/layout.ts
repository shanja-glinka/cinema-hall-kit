import {
  DEFAULT_EYE_HEIGHT,
  DEFAULT_VIEWING_ZONES,
  type BandConfig,
  type HallConfig,
  type RowLabels,
  type SectionConfig,
  type ViewingZone,
} from './schema.js';
import type { Pricing } from './session.js';
import { bandRuns, footprintsOverlap, PLAN_EPS } from './band-geometry.js';
import { resolveConstraints, type ConstraintOptions } from './constraints.js';

/** Stable seat identity: `<sectionId>.r<row in section>.s<seat in row>`, e.g. `centre.r2.s1`. */
export type SeatKey = string;

/**
 * A point or direction in metres, in the hall's coordinates: X to the right for a viewer facing the
 * screen, Y up, Z from the screen into the hall.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * One seat of a built layout (see `buildHallLayout`). Positions are in metres. The layout is plain
 * data, so it can be stored, sent and compared.
 */
export interface Seat {
  /**
   * Stable identity of the seat. It survives relabelling and reordering, so use it for selections
   * and storage.
   */
  key: SeatKey;
  /** Display label, e.g. `B4`. Changes with numbering; never use it as an identifier. */
  label: string;
  /** Row label, e.g. `B`. */
  row: string;
  /** Display number within the row. */
  number: number;
  /** Global 0-based row index (front to back, through all bands). */
  rowIndex: number;
  /** 0-based position within the band row, left to right, counting excluded positions. */
  col: number;
  /** Id of the band the seat belongs to. */
  bandId: string;
  /**
   * Level of the seat's band: 0 for the ground floor, 1 and up for a balcony (see `BandBox`).
   * `buildHallLayout` always sets it; it is optional so that seats built by hand before levels
   * existed stay valid, and a missing level means 0.
   */
  level?: number;
  sectionId: string;
  /** 1-based row and seat inside the section (the numbers in the key). */
  sectionRow: number;
  sectionSeat: number;
  /** Id of the seat type, a key of the hall's `seatTypes`. */
  seatTypeId: string;
  /** Pricing tier: the section's `priceTier`, or its seat type id when none is set. */
  priceTier: string;
  /** Resolved colour: the section's colour when it has one, otherwise the seat type's colour. */
  color: string;
  /** Centre of the seat footprint on the floor of its row. Metres. */
  position: Vec3;
  /** Eye point of a seated viewer. Metres. */
  eye: Vec3;
}

/** One row across the hall, front to back. A row can hold seats of several sections of one band. */
export interface Row {
  /** Global 0-based row index, front to back through all bands. */
  index: number;
  /** Row label, for example `B`. */
  label: string;
  /** Id of the band the row belongs to. */
  bandId: string;
  /**
   * Level of the row's band: 0 for the ground floor, 1 and up for a balcony. Always set by
   * `buildHallLayout`; a missing level means 0.
   */
  level?: number;
  /** Floor height of this row (rake). */
  elevation: number;
  /** Keys of the row's seats, left to right. */
  seatKeys: SeatKey[];
}

/**
 * Footprint of one section on the floor, in metres, with the grid values it was built from. Used to
 * place section overlays.
 */
export interface SectionBox {
  bandId: string;
  sectionId: string;
  rows: number;
  seatsPerRow: number;
  seatPitch: number;
  rowSpacing: number;
  seatTypeId: string;
  /** Footprint of seat centres ± half pitch/spacing. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Global index of the section's first row. */
  firstRowIndex: number;
  /**
   * Level of the section's band: 0 for the ground floor, 1 and up for a balcony. Always set by
   * `buildHallLayout`; a missing level means 0.
   */
  level?: number;
  /** Floor height of the section's first row. Always set by `buildHallLayout`. */
  floorElevation?: number;
}

/**
 * Where one band sits, in metres: its depth range on the floor plan, its floor heights and its
 * level. Bands follow config order.
 */
export interface BandBox {
  id: string;
  /** The band's display name, when the config gives one. */
  label?: string;
  /** 0-based position of the band in `layout.bands`. */
  index: number;
  /**
   * 0 for the ground floor. 1 and up for a band whose plan footprint overlaps another band and sits
   * above it (a balcony), one more than the highest band under it, whatever their order in the
   * config. A band that continues after another one (no `startDistance` and no `elevation`) keeps
   * at least that band's level.
   */
  level: number;
  /** Footprint along Z: the first row centre minus half its spacing, the last plus half. */
  minZ: number;
  maxZ: number;
  /** Floor height of the band's first row. */
  floorElevation: number;
  /** Floor height of the band's last row. */
  topElevation: number;
  /** True when the band overlaps a lower band in plan (it hangs over it), in any config order. */
  overhang: boolean;
}

/**
 * The screen in metres. `elevation` is the height of its bottom edge above the floor. `center` is
 * the centre of the screen plane.
 */
export interface ScreenGeometry {
  width: number;
  height: number;
  elevation: number;
  /**
   * Sagitta: how much closer the edges are to the audience than the centre. 0 for a flat screen.
   */
  curvature: number;
  /** Centre of the screen plane, in metres. */
  center: Vec3;
}

/** A seat type as the layout uses it: the body size in metres and the default colour. */
export interface SeatTypeInfo {
  label: string;
  width: number;
  depth: number;
  color: string;
}

/**
 * A hall config turned into positioned seats, rows and sections, as produced by `buildHallLayout`.
 * All distances are in metres.
 */
export interface HallLayout {
  /** Version of the layout format. `1` today. */
  schemaVersion: 1;
  name: string;
  /** Hall box size in metres, with the optional wall and floor colours. */
  hall: { width: number; depth: number; height: number; wallColor?: string; floorColor?: string };
  /** Screen geometry. */
  screen: ScreenGeometry;
  /** Seat types by id. */
  seatTypes: Record<string, SeatTypeInfo>;
  /**
   * Viewing zones, in the order they are checked (see `zoneForFov`). These are the config's zones,
   * or the defaults.
   */
  zones: ViewingZone[];
  /** Base prices of the hall (from `config.pricing`); absent when the hall has none. */
  pricing?: Pricing;
  /** Eye height of a seated viewer above the floor of their row, in metres. */
  eyeHeight: number;
  /**
   * Thickness of a balcony floor slab in metres: the underside of an elevated band is this far
   * below the floor of its row. Resolved like the validation thresholds (see `BuildLayoutOptions`):
   * the host's override, else `config.constraints.balconySlabThickness` (unless `enforce`), else
   * the default (0.3). Build the layout with the options given to `validateHall` and a renderer
   * draws balconies with the sizes the validation checks. Always set by
   * `buildHallLayout`; optional so that layouts built by hand stay valid (a renderer then uses
   * the default).
   */
  balconySlabThickness?: number;
  /**
   * Height in metres of the barrier at the front edge of an elevated band, above its first-row
   * floor. Resolved like `balconySlabThickness`; the default is 0.8. Always set by
   * `buildHallLayout`; optional like `balconySlabThickness`.
   */
  balconyParapetHeight?: number;
  /** Row by row, then left to right. */
  seats: Seat[];
  /** Rows, front to back. */
  rows: Row[];
  /** Section footprints, in band and section order. */
  sections: SectionBox[];
  /**
   * Bands with their depth range, floor heights and level, in config order. Always set by
   * `buildHallLayout`; a layout built by hand without it is a single-level hall.
   */
  bands?: BandBox[];
  /** Interior of the hall: x ∈ [-width/2, width/2], y ∈ [0, height], z ∈ [0, depth]. */
  bounds: { min: Vec3; max: Vec3 };
}

/** A seat as `buildHallLayout` returns it: `level` is always set. */
export interface BuiltSeat extends Seat {
  level: number;
}

/** A row as `buildHallLayout` returns it: `level` is always set. */
export interface BuiltRow extends Row {
  level: number;
}

/** A section box as `buildHallLayout` returns it: `level` and `floorElevation` are always set. */
export interface BuiltSectionBox extends SectionBox {
  level: number;
  floorElevation: number;
}

/**
 * The layout `buildHallLayout` returns: a `HallLayout` with every optional level and balcony field
 * filled in. It can be passed wherever a `HallLayout` is accepted. Components and functions accept
 * the wider `HallLayout`, so layouts built by hand without these fields stay valid.
 */
export interface BuiltHallLayout extends HallLayout {
  balconySlabThickness: number;
  balconyParapetHeight: number;
  seats: BuiltSeat[];
  rows: BuiltRow[];
  sections: BuiltSectionBox[];
  bands: BandBox[];
}

/**
 * Options for `buildHallLayout`: the same `constraints` and `enforce` as `ValidateOptions`. They
 * only decide `balconySlabThickness` and `balconyParapetHeight`; seat positions, keys and hashes do
 * not depend on them. Pass the options given to `validateHall` so that the layout a renderer draws
 * has the balcony sizes the rules checked.
 */
export type BuildLayoutOptions = ConstraintOptions;

/** Section values after applying band defaults. */
export interface ResolvedSection {
  id: string;
  rows: number;
  seatsPerRow: number;
  rowSpacing: number;
  seatPitch: number;
  seatType: string;
  priceTier: string;
  gapBefore: number;
  color?: string;
  exclude: ReadonlySet<string>;
}

/**
 * Applies band defaults. Requires a structurally valid config (`parseHallConfig` guarantees it);
 * a missing required value throws, because it means the caller skipped validation.
 */
export function resolveSection(band: BandConfig, section: SectionConfig): ResolvedSection {
  const d = band.defaults ?? {};
  const rows = section.rows ?? d.rows;
  const rowSpacing = section.rowSpacing ?? d.rowSpacing;
  const seatPitch = section.seatPitch ?? d.seatPitch;
  const seatType = section.seatType ?? d.seatType;
  if (
    rows === undefined ||
    rowSpacing === undefined ||
    seatPitch === undefined ||
    seatType === undefined
  ) {
    throw new Error(
      `Section "${section.id}" in band "${band.id}" lacks rows/rowSpacing/seatPitch/seatType. Validate the config with parseHallConfig first.`,
    );
  }
  return {
    id: section.id,
    rows,
    seatsPerRow: section.seatsPerRow,
    rowSpacing,
    seatPitch,
    seatType,
    priceTier: section.priceTier ?? d.priceTier ?? seatType,
    gapBefore: section.gapBefore ?? 0,
    color: section.color,
    exclude: new Set(section.exclude ?? []),
  };
}

/** The section-local part of a seat key, `r<row>.s<seat>`, from 1-based row and seat numbers. */
export function localSeatKey(row: number, seat: number): string {
  return `r${row}.s${seat}`;
}

/**
 * Builds a seat key `<sectionId>.r<row>.s<seat>` from a section id and 1-based row and seat
 * numbers. `parseSeatKey` reverses it.
 */
export function makeSeatKey(sectionId: string, row: number, seat: number): SeatKey {
  return `${sectionId}.${localSeatKey(row, seat)}`;
}

/** `centre.r2.s1` → `{ sectionId: 'centre', row: 2, seat: 1 }`; `null` if malformed. */
export function parseSeatKey(key: string): { sectionId: string; row: number; seat: number } | null {
  const match = /^([A-Za-z0-9][A-Za-z0-9_-]*)\.r([1-9]\d*)\.s([1-9]\d*)$/.exec(key);
  if (!match) return null;
  return { sectionId: match[1]!, row: Number(match[2]), seat: Number(match[3]) };
}

/** 0 → A, 25 → Z, 26 → AA (spreadsheet style). */
export function alphabeticLabel(index: number): string {
  let n = index + 1;
  let label = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

/**
 * Label of a global row, from its 0-based index. The scheme is the config's `rowLabels`:
 * `alphabetic` (A, B, … Z, AA), `numeric` (1, 2, …) or an explicit list. A list that is shorter
 * than the hall falls back to the row number.
 */
export function rowLabel(scheme: RowLabels | undefined, index: number): string {
  if (scheme === undefined || scheme === 'alphabetic') return alphabeticLabel(index);
  if (scheme === 'numeric') return String(index + 1);
  return scheme[index] ?? String(index + 1);
}

/** Number of rows in a band: the deepest section decides. */
export function bandRowCount(band: BandConfig): number {
  return Math.max(...band.sections.map((s) => resolveSection(band, s).rows));
}

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/** Builds the layout without host thresholds; see the overload with `options` below. */
export function buildHallLayout(config: HallConfig): BuiltHallLayout;
/**
 * Computes the position of every seat. Pure and deterministic: for a given config `version`
 * the algorithm is frozen, so seat keys and the geometry hash stay stable across releases.
 *
 * - Bands follow each other from the screen to the back; every band is centred on X = 0. A band
 *   with `startDistance` starts there instead, and later bands continue after it.
 * - Within a band, sections run left to right separated by `gapBefore` aisles.
 * - Row `r` of every section in a band shares the row label and the floor height; its depth
 *   depends on the section's own `rowSpacing`.
 * - The floor rises by the band's `riserHeight` for every row after the first row of the hall. A
 *   band with `elevation` puts its first row at that height and rises from there.
 * - A band that overlaps an earlier, lower band in plan is an overhang (a balcony) and gets a
 *   higher `level`; see `BandBox`.
 *
 * @param config A structurally valid config (`parseHallConfig` guarantees it).
 * @param options Host thresholds for the balcony sizes (see `BuildLayoutOptions`); without them
 *   the config's own `constraints` and the defaults apply.
 * @returns The built layout.
 *
 * @example
 * ```ts
 * const layout = buildHallLayout(config);
 * const first = layout.rows[0];
 * // With host thresholds: the same options as validateHall, so the balcony sizes match.
 * const enforced = buildHallLayout(config, { enforce: true, constraints: hostConstraints });
 * console.log(layout.seats.length, first?.label, first?.seatKeys);
 * ```
 */
export function buildHallLayout(config: HallConfig, options?: BuildLayoutOptions): BuiltHallLayout;
export function buildHallLayout(config: HallConfig, options?: BuildLayoutOptions): BuiltHallLayout {
  // Passed straight to `Array.map`, the second argument is the index: build without options.
  if (typeof options !== 'object' || options === null) options = undefined;
  const eyeHeight = config.layout.eyeHeight ?? DEFAULT_EYE_HEIGHT;
  const numbering = config.layout.seatNumbering ?? 'continuous';
  const seats: BuiltSeat[] = [];
  const rows: BuiltRow[] = [];
  const sections: BuiltSectionBox[] = [];
  const bands: BandBox[] = [];
  const runs = bandRuns(config.layout.bands);

  // First pass: where every band sits. Levels need every band's place, so they come after it.
  const planned: PlannedBand[] = [];
  {
    let startZ = config.layout.firstRowDistance;
    let rowsBefore = 0;
    let floor = 0;
    config.layout.bands.forEach((band, bandIndex) => {
      const resolved = band.sections.map((s) => resolveSection(band, s));
      if (band.startDistance !== undefined) startZ = band.startDistance;
      else if (bandIndex > 0) startZ += band.gapBefore ?? resolved[0]!.rowSpacing;
      const riser = band.riserHeight ?? 0;
      const rowCount = Math.max(...resolved.map((s) => s.rows));
      const floorElevation = band.elevation ?? (rowsBefore > 0 ? floor + riser : floor);
      // The same steps as the rows below, so the floors match them exactly.
      for (let r = 0; r < rowCount; r++) {
        if (r === 0 && band.elevation !== undefined) floor = band.elevation;
        else if (rowsBefore + r > 0) floor += riser;
      }
      planned.push({
        resolved,
        startZ,
        riser,
        rowCount,
        at: {
          run: runs[bandIndex]!,
          minZ: Math.min(...resolved.map((s) => startZ - s.rowSpacing / 2)),
          maxZ: Math.max(
            ...resolved.map((s) => startZ + (s.rows - 1) * s.rowSpacing + s.rowSpacing / 2),
          ),
          floorElevation,
          topElevation: floorElevation + (rowCount - 1) * riser,
        },
      });
      startZ += Math.max(...resolved.map((s) => (s.rows - 1) * s.rowSpacing));
      rowsBefore += rowCount;
    });
  }
  bands.push(...placeBands(config.layout.bands, planned));

  let rowIndexBase = 0;
  let elevation = 0;

  config.layout.bands.forEach((band, bandIndex) => {
    const { resolved, startZ: bandStartZ, riser, rowCount } = planned[bandIndex]!;
    const width = resolved.reduce(
      (sum, s, i) => sum + (i === 0 ? 0 : s.gapBefore) + s.seatsPerRow * s.seatPitch,
      0,
    );
    const box = bands[bandIndex]!;
    const level = box.level;

    // X origin of every section.
    const sectionX: number[] = [];
    let cursor = -width / 2;
    resolved.forEach((s, i) => {
      if (i > 0) cursor += s.gapBefore;
      sectionX.push(cursor);
      cursor += s.seatsPerRow * s.seatPitch;
    });

    for (let r = 0; r < rowCount; r++) {
      const globalRow = rowIndexBase + r;
      if (r === 0 && band.elevation !== undefined) elevation = band.elevation;
      else if (globalRow > 0) elevation += riser;
      const label = rowLabel(config.layout.rowLabels, globalRow);
      const row: BuiltRow = {
        index: globalRow,
        label,
        bandId: band.id,
        level,
        elevation: round(elevation),
        seatKeys: [],
      };
      let number = 0;
      let col = 0;

      resolved.forEach((s, si) => {
        if (numbering === 'perSection') number = 0;
        if (r >= s.rows) {
          col += s.seatsPerRow;
          return;
        }
        const z = bandStartZ + r * s.rowSpacing;
        const seatType = config.seatTypes[s.seatType]!;
        for (let k = 0; k < s.seatsPerRow; k++, col++) {
          const local = localSeatKey(r + 1, k + 1);
          if (s.exclude.has(local)) continue;
          number += 1;
          const x = sectionX[si]! + (k + 0.5) * s.seatPitch;
          const key = makeSeatKey(s.id, r + 1, k + 1);
          seats.push({
            key,
            label: `${label}${number}`,
            row: label,
            number,
            rowIndex: globalRow,
            col,
            bandId: band.id,
            level,
            sectionId: s.id,
            sectionRow: r + 1,
            sectionSeat: k + 1,
            seatTypeId: s.seatType,
            priceTier: s.priceTier,
            color: s.color ?? seatType.color,
            position: { x: round(x), y: round(elevation), z: round(z) },
            eye: { x: round(x), y: round(elevation + eyeHeight), z: round(z) },
          });
          row.seatKeys.push(key);
        }
      });
      rows.push(row);
    }

    resolved.forEach((s, si) => {
      const x0 = sectionX[si]!;
      sections.push({
        bandId: band.id,
        sectionId: s.id,
        rows: s.rows,
        seatsPerRow: s.seatsPerRow,
        seatPitch: s.seatPitch,
        rowSpacing: s.rowSpacing,
        seatTypeId: s.seatType,
        minX: round(x0),
        maxX: round(x0 + s.seatsPerRow * s.seatPitch),
        minZ: round(bandStartZ - s.rowSpacing / 2),
        maxZ: round(bandStartZ + (s.rows - 1) * s.rowSpacing + s.rowSpacing / 2),
        firstRowIndex: rowIndexBase,
        level,
        floorElevation: box.floorElevation,
      });
    });

    rowIndexBase += rowCount;
  });

  const { hall, screen } = config;
  const balconySizes = resolveConstraints(config, options);
  return {
    schemaVersion: 1,
    name: config.name,
    hall: {
      width: hall.width,
      depth: hall.depth,
      height: hall.height,
      ...(hall.wallColor ? { wallColor: hall.wallColor } : {}),
      ...(hall.floorColor ? { floorColor: hall.floorColor } : {}),
    },
    screen: {
      width: screen.width,
      height: screen.height,
      elevation: screen.elevation,
      curvature: screen.curvature ?? 0,
      center: { x: 0, y: round(screen.elevation + screen.height / 2), z: 0 },
    },
    seatTypes: Object.fromEntries(
      Object.entries(config.seatTypes).map(([id, t]) => [
        id,
        { label: t.label, width: t.width, depth: t.depth, color: t.color },
      ]),
    ),
    zones: [...(config.viewingZones ?? DEFAULT_VIEWING_ZONES)].map((z) => ({ ...z })),
    ...(config.pricing ? { pricing: { tiers: { ...config.pricing.tiers } } } : {}),
    eyeHeight,
    balconySlabThickness: balconySizes.balconySlabThickness,
    balconyParapetHeight: balconySizes.balconyParapetHeight,
    seats,
    rows,
    sections,
    bands,
    bounds: {
      min: { x: -hall.width / 2, y: 0, z: 0 },
      max: { x: hall.width / 2, y: hall.height, z: hall.depth },
    },
  };
}

/** Where a band is being placed, before its level is known. */
interface BandPlacement {
  run: number;
  minZ: number;
  maxZ: number;
  floorElevation: number;
  topElevation: number;
}

/** A band after the first pass of `buildHallLayout`: its resolved sections and its place. */
interface PlannedBand {
  resolved: ResolvedSection[];
  /** Distance from the screen to the centre line of the band's first row. */
  startZ: number;
  riser: number;
  rowCount: number;
  at: BandPlacement;
}

/**
 * The boxes of all bands, in config order. A band is a balcony (level 1 and up) when its footprint
 * overlaps a band of another run whose floor is lower, whatever their order in the config: one
 * more than the highest such band. A band that continues after the previous one (no
 * `startDistance` and no `elevation`) keeps at least that band's level. Bands are leveled from the
 * lowest floor up, so every band under a band already has its level.
 */
function placeBands(
  configBands: readonly BandConfig[],
  planned: readonly PlannedBand[],
): BandBox[] {
  const order = planned
    .map((_, index) => index)
    .sort((a, b) => planned[a]!.at.floorElevation - planned[b]!.at.floorElevation || a - b);
  const levels: number[] = [];
  const overhangs: boolean[] = [];
  for (const index of order) {
    const band = configBands[index]!;
    const at = planned[index]!.at;
    const continues = index > 0 && band.startDistance === undefined && band.elevation === undefined;
    let level = continues ? (levels[index - 1] ?? 0) : 0;
    let overhang = false;
    planned.forEach((other, otherIndex) => {
      if (other.at.run === at.run || !footprintsOverlap(at, other.at)) return;
      if (at.floorElevation > other.at.floorElevation + PLAN_EPS) {
        overhang = true;
        level = Math.max(level, (levels[otherIndex] ?? 0) + 1);
      }
    });
    levels[index] = level;
    overhangs[index] = overhang;
  }
  return configBands.map((band, index) => {
    const at = planned[index]!.at;
    return {
      id: band.id,
      ...(band.label !== undefined ? { label: band.label } : {}),
      index,
      level: levels[index]!,
      minZ: round(at.minZ),
      maxZ: round(at.maxZ),
      floorElevation: round(at.floorElevation),
      topElevation: round(at.topElevation),
      overhang: overhangs[index]!,
    };
  });
}
