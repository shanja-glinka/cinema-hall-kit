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
  /** Row by row, then left to right. */
  seats: Seat[];
  /** Rows, front to back. */
  rows: Row[];
  /** Section footprints, in band and section order. */
  sections: SectionBox[];
  /** Interior of the hall: x ∈ [-width/2, width/2], y ∈ [0, height], z ∈ [0, depth]. */
  bounds: { min: Vec3; max: Vec3 };
}

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

/**
 * Computes the position of every seat. Pure and deterministic: for a given config `version`
 * the algorithm is frozen, so seat keys and the geometry hash stay stable across releases.
 *
 * - Bands follow each other from the screen to the back; every band is centred on X = 0.
 * - Within a band, sections run left to right separated by `gapBefore` aisles.
 * - Row `r` of every section in a band shares the row label and the floor height; its depth
 *   depends on the section's own `rowSpacing`.
 * - The floor rises by the band's `riserHeight` for every row after the first row of the hall.
 *
 * @example
 * ```ts
 * const layout = buildHallLayout(config);
 * const first = layout.rows[0];
 * console.log(layout.seats.length, first?.label, first?.seatKeys);
 * ```
 */
export function buildHallLayout(config: HallConfig): HallLayout {
  const eyeHeight = config.layout.eyeHeight ?? DEFAULT_EYE_HEIGHT;
  const numbering = config.layout.seatNumbering ?? 'continuous';
  const seats: Seat[] = [];
  const rows: Row[] = [];
  const sections: SectionBox[] = [];

  let bandStartZ = config.layout.firstRowDistance;
  let rowIndexBase = 0;
  let elevation = 0;

  config.layout.bands.forEach((band, bandIndex) => {
    const resolved = band.sections.map((s) => resolveSection(band, s));
    if (bandIndex > 0) bandStartZ += band.gapBefore ?? resolved[0]!.rowSpacing;

    const riser = band.riserHeight ?? 0;
    const rowCount = Math.max(...resolved.map((s) => s.rows));
    const width = resolved.reduce(
      (sum, s, i) => sum + (i === 0 ? 0 : s.gapBefore) + s.seatsPerRow * s.seatPitch,
      0,
    );

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
      if (globalRow > 0) elevation += riser;
      const label = rowLabel(config.layout.rowLabels, globalRow);
      const row: Row = {
        index: globalRow,
        label,
        bandId: band.id,
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
      });
    });

    bandStartZ += Math.max(...resolved.map((s) => (s.rows - 1) * s.rowSpacing));
    rowIndexBase += rowCount;
  });

  const { hall, screen } = config;
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
    seats,
    rows,
    sections,
    bounds: {
      min: { x: -hall.width / 2, y: 0, z: 0 },
      max: { x: hall.width / 2, y: hall.height, z: hall.depth },
    },
  };
}
