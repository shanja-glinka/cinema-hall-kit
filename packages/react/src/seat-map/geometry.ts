import type { HallLayout, SeatKey } from '@cinema-hall/core';

/*
 * Pure geometry of the 2D map. Units: centimetres (metres × 100), so the SVG user unit is about
 * a centimetre and corner radii and strokes stay in proportion to the seats.
 * Mapping: layout X → SVG x, layout Z → SVG y (rows go down, the screen is at the top).
 */

/** Centimetres per metre: layout positions are metres, the map works in centimetres. */
export const CM_PER_M = 100;
const SEAT_GAP = 0.14;
/** Share of a seat footprint left empty between neighbouring seats on the map. */
export const SEAT_GAP_RATIO = SEAT_GAP;
const LABEL_GUTTER = 120;
const SCREEN_ROOM = 150;
const PAD = 60;
/** Arc sagitta as a share of the seat block width, so the screen always curves a little. */
const ARC_SAG_RATIO = 0.04;
/** Distance from the arc edges to the screen label. */
const LABEL_DROP = 56;
/** Room between two level blocks, for the heading of the upper one. */
const LEVEL_GAP = 170;

/** One seat on the map, in SVG units. */
export interface SeatCell {
  key: SeatKey;
  /** Centre, SVG units. */
  cx: number;
  cy: number;
  /** Drawn size (already reduced by the gap between seats). */
  w: number;
  h: number;
  rowIndex: number;
  /** Index of the seat type in `MapGeometry.typeIds` (the hall's first type is 0). */
  typeIndex: number;
  typeId: string;
  color: string;
  /** Section the seat belongs to. */
  sectionId: string;
  /** Level of the seat: 0 for the ground floor, 1 and up for a balcony. */
  level: number;
}

/**
 * One level of the hall on the map. The ground floor comes first, under the screen; each upper
 * level (a balcony) is its own block below it, with a heading, so its seats never sit on top of the
 * seats under it.
 */
export interface MapLevel {
  level: number;
  /** Ids of the level's bands, in layout order. */
  bandIds: string[];
  /** The display names of those bands that have one. */
  bandLabels: string[];
  /** Top and bottom of the level's seats, SVG units. */
  top: number;
  bottom: number;
  /** Baseline of the level's heading; `null` for the first block (it has the screen instead). */
  headingY: number | null;
}

/**
 * A thin line between two sections that touch in one row (no aisle between them in the layout),
 * so the section boundary stays visible without inventing an aisle.
 */
export interface SectionDivider {
  rowIndex: number;
  x: number;
  /** Centre Y and height of the line. */
  y: number;
  h: number;
}

/** A row label on the map. */
export interface RowMark {
  index: number;
  label: string;
  /** Centre Y of the row. */
  y: number;
  /** X of the row label, left of the first seat. */
  x: number;
}

/** Everything needed to draw the map: seats, rows, screen arc and the viewBox. */
export interface MapGeometry {
  viewBox: { x: number; y: number; width: number; height: number };
  seats: SeatCell[];
  byKey: Map<SeatKey, SeatCell>;
  rows: RowMark[];
  typeIds: string[];
  /** Boundaries between sections that touch within a row. Aisles are real gaps between seats. */
  dividers: SectionDivider[];
  /** Smallest seat footprint width (before the gap between seats), SVG units. */
  minSeatWidth: number;
  screen: {
    path: string;
    cx: number;
    top: number;
    width: number;
    height: number;
    sagitta: number;
    /** Baseline of the screen label, under the arc. */
    labelY: number;
  };
  /** Lower-left and upper-right of the seating area, used for minimaps. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** The levels that have seats, ground floor first. A hall without balconies has one. */
  levels: MapLevel[];
}

/** A keyboard navigation direction on the map. */
export type NavDirection = 'left' | 'right' | 'up' | 'down';

/**
 * Projects the layout to SVG units.
 * @param layout - The built hall layout.
 * @returns The geometry of the map.
 */
export function buildMapGeometry(layout: HallLayout): MapGeometry {
  const typeIds = Object.keys(layout.seatTypes);
  const seats: SeatCell[] = [];
  const byKey = new Map<SeatKey, SeatCell>();
  for (const seat of layout.seats) {
    const type = layout.seatTypes[seat.seatTypeId];
    const fullW = (type?.width ?? 0.5) * CM_PER_M;
    const fullH = (type?.depth ?? 0.55) * CM_PER_M;
    const typeIndex = Math.max(0, typeIds.indexOf(seat.seatTypeId));
    const cell: SeatCell = {
      key: seat.key,
      cx: seat.position.x * CM_PER_M,
      cy: seat.position.z * CM_PER_M,
      w: fullW * (1 - SEAT_GAP),
      h: fullH * (1 - SEAT_GAP),
      rowIndex: seat.rowIndex,
      typeIndex,
      typeId: seat.seatTypeId,
      color: type?.color ?? '#808080',
      sectionId: seat.sectionId,
      level: seat.level ?? 0,
    };
    seats.push(cell);
    byKey.set(seat.key, cell);
  }
  const levels = stackLevels(layout, seats);

  const minCx = seats.reduce((m, s) => Math.min(m, s.cx - s.w / 2), Infinity);
  const maxCx = seats.reduce((m, s) => Math.max(m, s.cx + s.w / 2), -Infinity);
  const minCy = seats.reduce((m, s) => Math.min(m, s.cy - s.h / 2), Infinity);
  const maxCy = seats.reduce((m, s) => Math.max(m, s.cy + s.h / 2), -Infinity);
  const hasSeats = seats.length > 0;
  const bounds = hasSeats
    ? { minX: minCx, maxX: maxCx, minY: minCy, maxY: maxCy }
    : { minX: -100, maxX: 100, minY: 0, maxY: 100 };

  const screenWidth = layout.screen.width * CM_PER_M;
  const screenCx = layout.screen.center.x * CM_PER_M;
  const sagitta = layout.screen.curvature * CM_PER_M;
  const screenTop = bounds.minY - SCREEN_ROOM;
  const left = Math.min(screenCx - screenWidth / 2, bounds.minX);
  const right = Math.max(screenCx + screenWidth / 2, bounds.maxX);
  const arcSagitta = Math.max(sagitta, (bounds.maxX - bounds.minX) * ARC_SAG_RATIO);
  const screenPath = screenArc(bounds.minX, bounds.maxX, screenTop, arcSagitta);

  const rows: RowMark[] = [];
  const firstByRow = new Map<number, SeatCell>();
  for (const seat of seats) {
    const current = firstByRow.get(seat.rowIndex);
    if (!current || seat.cx < current.cx) firstByRow.set(seat.rowIndex, seat);
  }
  for (const row of layout.rows) {
    const first = firstByRow.get(row.index);
    if (!first) continue;
    rows.push({
      index: row.index,
      label: row.label,
      y: first.cy,
      x: bounds.minX - LABEL_GUTTER / 2,
    });
  }

  const dividers = sectionDividers(seats);
  const minSeatWidth = seats.reduce(
    (m, s) => Math.min(m, s.w / (1 - SEAT_GAP)),
    hasSeats ? Infinity : 0.5 * CM_PER_M,
  );

  const vx = Math.min(left, bounds.minX) - PAD - LABEL_GUTTER / 2;
  const vRight = Math.max(right, bounds.maxX) + PAD;
  const vy = screenTop - PAD;
  const vBottom = bounds.maxY + PAD;
  return {
    viewBox: { x: vx, y: vy, width: vRight - vx, height: vBottom - vy },
    seats,
    byKey,
    rows,
    typeIds,
    dividers,
    minSeatWidth,
    screen: {
      path: screenPath,
      cx: screenCx,
      top: screenTop,
      width: screenWidth,
      height: arcSagitta,
      sagitta: arcSagitta,
      labelY: screenTop + arcSagitta + LABEL_DROP,
    },
    bounds,
    levels,
  };
}

/**
 * Moves the seats of each upper level below the level before it, so that levels that overlap in
 * plan (a balcony over the rear stalls) become separate blocks. A hall with one level is unchanged.
 */
function stackLevels(layout: HallLayout, seats: SeatCell[]): MapLevel[] {
  const ids = [...new Set(seats.map((seat) => seat.level))].sort((a, b) => a - b);
  const levels: MapLevel[] = [];
  let previousBottom: number | null = null;
  for (const level of ids) {
    const cells = seats.filter((seat) => seat.level === level);
    const rawTop = cells.reduce((m, s) => Math.min(m, s.cy - s.h / 2), Infinity);
    const offset = previousBottom === null ? 0 : previousBottom + LEVEL_GAP - rawTop;
    if (offset !== 0) for (const cell of cells) cell.cy += offset;
    const top = rawTop + offset;
    const bottom = cells.reduce((m, s) => Math.max(m, s.cy + s.h / 2), -Infinity);
    const bands = (layout.bands ?? []).filter((band) => (band.level ?? 0) === level);
    const bandIds =
      bands.length > 0
        ? bands.map((band) => band.id)
        : [...new Set(layout.seats.filter((s) => (s.level ?? 0) === level).map((s) => s.bandId))];
    levels.push({
      level,
      bandIds,
      bandLabels: bands.flatMap((band) => (band.label ? [band.label] : [])),
      top,
      bottom,
      headingY: previousBottom === null ? null : top - LEVEL_GAP * 0.38,
    });
    previousBottom = bottom;
  }
  return levels;
}

/**
 * Lines between neighbouring seats of different sections in a row whose footprints leave less
 * than a seat width between them. A wider gap is an aisle and is drawn as empty space.
 */
function sectionDividers(seats: readonly SeatCell[]): SectionDivider[] {
  const byRow = new Map<number, SeatCell[]>();
  for (const seat of seats) {
    const list = byRow.get(seat.rowIndex);
    if (list) list.push(seat);
    else byRow.set(seat.rowIndex, [seat]);
  }
  const out: SectionDivider[] = [];
  for (const [rowIndex, list] of byRow) {
    const sorted = list.slice().sort((a, b) => a.cx - b.cx);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1]!;
      const b = sorted[i]!;
      if (a.sectionId === b.sectionId) continue;
      const gap = b.cx - b.w / 2 - (a.cx + a.w / 2);
      if (gap >= Math.min(a.w, b.w)) continue;
      out.push({
        rowIndex,
        x: (a.cx + a.w / 2 + b.cx - b.w / 2) / 2,
        y: (a.cy + b.cy) / 2,
        h: Math.max(a.h, b.h) * 1.1,
      });
    }
  }
  return out;
}

/** A shallow arc whose centre sits at `top` and whose edges drop by `sagitta`. */
function screenArc(x0: number, x1: number, top: number, sagitta: number): string {
  const edgeY = top + sagitta;
  const controlY = top - sagitta;
  return `M ${x0} ${edgeY} Q ${(x0 + x1) / 2} ${controlY} ${x1} ${edgeY}`;
}

/**
 * Position of a seat as a percentage of the viewBox, for `transform-origin` of the zoom.
 * @param geometry - Map geometry.
 * @param key - Seat key.
 * @returns Percentages `{ x, y }`, or `null` for an unknown seat.
 */
export function originPercent(
  geometry: MapGeometry,
  key: SeatKey,
): { x: number; y: number } | null {
  const cell = geometry.byKey.get(key);
  if (!cell) return null;
  const { viewBox } = geometry;
  return {
    x: ((cell.cx - viewBox.x) / viewBox.width) * 100,
    y: ((cell.cy - viewBox.y) / viewBox.height) * 100,
  };
}

/**
 * Nearest seat in a direction from `from`. Left/right prefer the same row; up/down prefer the
 * same column.
 * @param geometry - Map geometry.
 * @param from - Seat to start from.
 * @param direction - Arrow direction.
 * @returns The seat key, or `null` when there is no seat that way.
 */
export function nearestSeat(
  geometry: MapGeometry,
  from: SeatKey,
  direction: NavDirection,
): SeatKey | null {
  const origin = geometry.byKey.get(from);
  if (!origin) return null;
  let best: SeatCell | null = null;
  let bestScore = Infinity;
  for (const cell of geometry.seats) {
    if (cell.key === from) continue;
    // Left and right stay on the seat's level; up and down move between levels too.
    if ((direction === 'left' || direction === 'right') && cell.level !== origin.level) continue;
    const dx = cell.cx - origin.cx;
    const dy = cell.cy - origin.cy;
    let score: number;
    switch (direction) {
      case 'right':
        if (dx <= 0) continue;
        score = dx + Math.abs(dy) * 3;
        break;
      case 'left':
        if (dx >= 0) continue;
        score = -dx + Math.abs(dy) * 3;
        break;
      case 'down':
        if (dy <= 0) continue;
        score = dy + Math.abs(dx) * 2;
        break;
      case 'up':
        if (dy >= 0) continue;
        score = -dy + Math.abs(dx) * 2;
        break;
    }
    if (score < bestScore) {
      bestScore = score;
      best = cell;
    }
  }
  return best?.key ?? null;
}

/**
 * Keys of the first and last seat of the row of `from` (for Home/End).
 * @param geometry - Map geometry.
 * @param from - A seat in the row.
 * @returns The leftmost and rightmost seat keys, or `null`s for an unknown seat.
 */
export function rowEdges(
  geometry: MapGeometry,
  from: SeatKey,
): { first: SeatKey | null; last: SeatKey | null } {
  const origin = geometry.byKey.get(from);
  if (!origin) return { first: null, last: null };
  let first: SeatCell | null = null;
  let last: SeatCell | null = null;
  for (const cell of geometry.seats) {
    if (cell.rowIndex !== origin.rowIndex) continue;
    if (!first || cell.cx < first.cx) first = cell;
    if (!last || cell.cx > last.cx) last = cell;
  }
  return { first: first?.key ?? null, last: last?.key ?? null };
}

/**
 * Seats of each row, left to right, for the grid's `role=row` structure.
 * @param geometry - Map geometry.
 * @returns Rows in order, each with its label and seats.
 */
export function groupRows(
  geometry: MapGeometry,
): { rowIndex: number; label: string; seats: SeatCell[] }[] {
  const byRow = new Map<number, SeatCell[]>();
  for (const seat of geometry.seats) {
    const list = byRow.get(seat.rowIndex);
    if (list) list.push(seat);
    else byRow.set(seat.rowIndex, [seat]);
  }
  const labels = new Map(geometry.rows.map((row) => [row.index, row.label]));
  return [...byRow.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rowIndex, seats]) => ({
      rowIndex,
      label: labels.get(rowIndex) ?? '',
      seats: seats.slice().sort((a, b) => a.cx - b.cx),
    }));
}
