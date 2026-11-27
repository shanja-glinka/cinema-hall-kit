import { bandRuns, footprintsOverlap, PLAN_EPS } from '../../band-geometry.js';
import type { BandBox, BuiltHallLayout, BuiltSeat, SectionBox, Seat } from '../../layout.js';
import type { HallConfig } from '../../schema.js';

/** Two bands that overlap in plan: `upper` has the higher first-row floor. */
export interface BandPair {
  upper: BandBox;
  lower: BandBox;
  /** True when the two bands belong to one run (one follows the other). */
  sameRun: boolean;
}

/** A box on the floor plan, in metres. */
interface PlanBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * True when two ranges overlap by more than a rounding error. A range of zero length (a seat whose
 * type is unknown) overlaps a range that contains it, ends included.
 */
function spans(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  if (aMax - aMin <= PLAN_EPS) return aMin >= bMin - PLAN_EPS && aMin <= bMax + PLAN_EPS;
  return Math.min(aMax, bMax) - Math.max(aMin, bMin) > PLAN_EPS;
}

/**
 * The plan footprint of a seat's body: its seat type's width and depth around its position. A seat
 * whose type the layout does not list is a point.
 */
export function seatBody(
  layout: BuiltHallLayout,
  seat: Pick<Seat, 'position' | 'seatTypeId'>,
): PlanBox {
  const type = layout.seatTypes[seat.seatTypeId];
  const halfWidth = (type?.width ?? 0) / 2;
  const halfDepth = (type?.depth ?? 0) / 2;
  const { x, z } = seat.position;
  return { minX: x - halfWidth, maxX: x + halfWidth, minZ: z - halfDepth, maxZ: z + halfDepth };
}

/** True when two plan boxes overlap by more than a rounding error (see `spans`). */
export const bodiesMeet = (a: PlanBox, b: PlanBox): boolean =>
  spans(a.minX, a.maxX, b.minX, b.maxX) && spans(a.minZ, a.maxZ, b.minZ, b.maxZ);

/** The seat bodies of one band and the depth range they cover. */
interface BandBodies {
  bodies: PlanBox[];
  minZ: number;
  maxZ: number;
}

function bodiesByBand(layout: BuiltHallLayout): Map<string, BandBodies> {
  const byBand = new Map<string, BandBodies>();
  for (const seat of layout.seats) {
    const body = seatBody(layout, seat);
    const known = byBand.get(seat.bandId);
    if (known === undefined) {
      byBand.set(seat.bandId, { bodies: [body], minZ: body.minZ, maxZ: body.maxZ });
      continue;
    }
    known.bodies.push(body);
    known.minZ = Math.min(known.minZ, body.minZ);
    known.maxZ = Math.max(known.maxZ, body.maxZ);
  }
  return byBand;
}

/** True when a seat body of one band overlaps a seat body of the other in plan. */
function seatsCollide(a: BandBodies | undefined, b: BandBodies | undefined): boolean {
  if (a === undefined || b === undefined || !spans(a.minZ, a.maxZ, b.minZ, b.maxZ)) return false;
  // Only the seats in the depth both bands reach can meet.
  const near = (list: PlanBox[], other: BandBodies) =>
    list.filter((body) => spans(body.minZ, body.maxZ, other.minZ, other.maxZ));
  const first = near(a.bodies, b);
  const second = near(b.bodies, a);
  return first.some((body) => second.some((other) => bodiesMeet(body, other)));
}

const ordered = (a: BandBox, b: BandBox, sameRun: boolean): BandPair =>
  a.floorElevation > b.floorElevation
    ? { upper: a, lower: b, sameRun }
    : { upper: b, lower: a, sameRun };

/**
 * Every pair of bands that overlap in plan (a balcony and the band under it). Bands of one run
 * follow each other and are not paired here, so a config without `startDistance` has no pairs. Of
 * two bands with the same floor height, the later one counts as the upper.
 */
export function overlappingBandPairs(config: HallConfig, layout: BuiltHallLayout): BandPair[] {
  const runs = bandRuns(config.layout.bands);
  const pairs: BandPair[] = [];
  layout.bands.forEach((b, j) => {
    for (let i = 0; i < j; i++) {
      const a = layout.bands[i]!;
      if (runs[i] === runs[j] || !footprintsOverlap(a, b)) continue;
      pairs.push(ordered(a, b, false));
    }
  });
  return pairs;
}

/**
 * The pairs of `overlappingBandPairs`, and the other pairs of bands whose seats overlap in plan:
 * a band placed so close behind another one (a small `gapBefore` or `startDistance`) that the
 * seat bodies of its first row reach into the last row of the other band. Row spacing alone does
 * not decide, since both are measured between row centres and a seat can be deeper than its row.
 */
export function collidingBandPairs(config: HallConfig, layout: BuiltHallLayout): BandPair[] {
  const runs = bandRuns(config.layout.bands);
  const pairs = overlappingBandPairs(config, layout);
  const bodies = bodiesByBand(layout);
  layout.bands.forEach((b, j) => {
    for (let i = 0; i < j; i++) {
      const a = layout.bands[i]!;
      const sameRun = runs[i] === runs[j];
      // Bands of different runs whose footprints overlap are paired already.
      if (!sameRun && footprintsOverlap(a, b)) continue;
      if (!seatsCollide(bodies.get(a.id), bodies.get(b.id))) continue;
      pairs.push(ordered(a, b, sameRun));
    }
  });
  return pairs;
}

/** Section boxes of one band. */
export function sectionsOfBand(layout: BuiltHallLayout, bandId: string): SectionBox[] {
  return layout.sections.filter((box) => box.bandId === bandId);
}

/**
 * The lowest floor of the rows of a band that the body of `seat` reaches into, or `undefined`
 * when it reaches into none. Each section of the band covers its footprint (`boxes`), widened
 * where its seats are wider than their pitch or deeper than their row spacing; each row covers its
 * strip of the section. The seat's own body (width and depth of its type) is compared, not only its
 * centre, so a seat beside a section whose body intersects it counts.
 */
export function floorAbove(
  layout: BuiltHallLayout,
  boxes: readonly SectionBox[],
  seat: Pick<BuiltSeat, 'position' | 'seatTypeId'>,
): number | undefined {
  const body = seatBody(layout, seat);
  let lowest: number | undefined;
  for (const box of boxes) {
    const type = layout.seatTypes[box.seatTypeId];
    const padX = Math.max(0, ((type?.width ?? 0) - box.seatPitch) / 2);
    const padZ = Math.max(0, ((type?.depth ?? 0) - box.rowSpacing) / 2);
    if (!spans(body.minX, body.maxX, box.minX - padX, box.maxX + padX)) continue;
    for (let r = 0; r < box.rows; r++) {
      const start = box.minZ + r * box.rowSpacing;
      if (!spans(body.minZ, body.maxZ, start - padZ, start + box.rowSpacing + padZ)) continue;
      const floor = layout.rows[box.firstRowIndex + r]?.elevation;
      if (floor !== undefined && (lowest === undefined || floor < lowest)) lowest = floor;
    }
  }
  return lowest;
}
