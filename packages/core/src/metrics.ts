import type { ViewingZone } from './schema.js';
import type { HallLayout, Seat, SeatKey, Vec3 } from './layout.js';

/** What a seated viewer sees of the screen from one seat, in metres and degrees. */
export interface SeatViewMetrics {
  /** Eye to the centre of the screen, metres. */
  distance: number;
  /** Horizontal angle the screen occupies from the eye point, degrees. */
  fovDeg: number;
  /** Signed X offset from the hall axis, metres: negative = left of centre. */
  lateralOffset: number;
  zone: ViewingZone;
}

const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Straight-line distance between two points, in metres. */
export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** First zone whose `minFov` the seat reaches; the last zone otherwise. */
export function zoneForFov(zones: readonly ViewingZone[], fovDeg: number): ViewingZone {
  return zones.find((z) => fovDeg >= z.minFov) ?? zones[zones.length - 1]!;
}

/**
 * View metrics from a seat's eye point. `fovDeg` is the horizontal angle that the screen fills from
 * the eye, following the screen's curvature. `distance` runs from the eye to the screen centre. Use
 * `computeSeatView` to look a seat up by key.
 */
export function computeViewForSeat(layout: HallLayout, seat: Pick<Seat, 'eye'>): SeatViewMetrics {
  const { eye } = seat;
  const { screen } = layout;
  // Edges of a curved screen come closer to the audience by the sagitta.
  const edgeZ = screen.curvature;
  const depth = Math.max(eye.z - edgeZ, 1e-6);
  const half = screen.width / 2;
  const fovDeg = toDeg(Math.atan2(half - eye.x, depth) + Math.atan2(half + eye.x, depth));
  return {
    distance: distance(eye, screen.center),
    fovDeg,
    lateralOffset: eye.x,
    zone: zoneForFov(layout.zones, fovDeg),
  };
}

/** Metrics of a seat by key; `null` when the key is not in the layout. */
export function computeSeatView(layout: HallLayout, key: SeatKey): SeatViewMetrics | null {
  const seat = layout.seats.find((s) => s.key === key);
  return seat ? computeViewForSeat(layout, seat) : null;
}
