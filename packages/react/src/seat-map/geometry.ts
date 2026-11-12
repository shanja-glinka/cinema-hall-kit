import type { HallLayout, SeatKey } from '@cinema-hall/core';

/*
 * Pure geometry of the 2D map. Units: centimetres (metres × 100), so the SVG user unit is about
 * a centimetre and corner radii and strokes stay in proportion to the seats.
 * Mapping: layout X → SVG x, layout Z → SVG y (rows go down, the screen is at the top).
 */

/** Centimetres per metre: layout positions are metres, the map works in centimetres. */
export const CM_PER_M = 100;
const SEAT_GAP = 0.14;
const LABEL_GUTTER = 120;
const SCREEN_ROOM = 150;
const PAD = 60;
/** Arc sagitta as a share of the seat block width, so the screen always curves a little. */
const ARC_SAG_RATIO = 0.04;
/** Distance from the arc edges to the screen label. */
const LABEL_DROP = 56;

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
    };
    seats.push(cell);
    byKey.set(seat.key, cell);
  }

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
  };
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
