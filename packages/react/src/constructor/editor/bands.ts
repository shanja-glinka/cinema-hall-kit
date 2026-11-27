import {
  balconySlabSteps,
  buildHallLayout,
  resolveConstraints,
  resolveSection,
  type BandConfig,
  type Constraints,
  type HallConfig,
} from '@cinema-hall/core';
import {
  applyPatch,
  findBand,
  FIT_EPSILON,
  fitParts,
  type FitOptions,
  moveItem,
  numberedId,
  replaceBands,
  sectionStem,
  structureIds,
  uniqueId,
} from './config.js';

/** Options of `addBand`. */
export interface AddBandOptions {
  /** Id of the band to insert after (default: at the end). */
  after?: string;
  /**
   * When even one row does not fit, make the hall deeper so the new band fits (default false: the
   * band takes the row count that overflows least, and the hall keeps its size).
   */
  growHall?: boolean;
}

/** Seats per row tried for a new band, most first: the widest that fits the hall is taken. */
const NEW_BAND_SEATS = [10, 8, 6, 4, 2, 1] as const;
/** Rows tried for a new band, most first. */
const NEW_BAND_ROWS = [3, 2, 1] as const;

/** Rounds a depth up to the next 5 cm, so a grown hall has a tidy size. */
function roundUp(metres: number): number {
  return Math.ceil(metres * 20 - 1e-6) / 20;
}

/**
 * A new band with one section, built to be valid where it can be. Its section uses the hall's first
 * seat type with the spacing and pitch the hall already uses for it, and takes the most seats per row
 * (10 down to 1) that fit the width and the most rows (3, 2 or 1) that fit the depth. With
 * `growHall`, a band that does not fit even with one row gets 3 rows and the hall is made deeper
 * (rounded up to 5 cm). The band keeps the riser of the band before it. Ids are numbered: the band is
 * `band-N` (shown as "Band N") and its section `band-N-section-1` (shown as "Section 1").
 * @param config Current hall.
 * @param opts `after` names the band to insert after; `growHall` allows a deeper hall.
 * @param fit The editor's constraint overrides, used to choose the sizes.
 * @returns The candidate config.
 */
export function addBand(
  config: HallConfig,
  opts: AddBandOptions = {},
  fit: FitOptions = {},
): unknown {
  const taken = structureIds(config);
  const id = numberedId('band', config.layout.bands.length + 1, taken);
  taken.add(id);
  const sectionId = numberedId(sectionStem(id), 1, taken);
  const bands = [...config.layout.bands];
  const index = opts.after === undefined ? bands.length : findBand(config, opts.after).index + 1;
  const previous = bands[index - 1] ?? bands[bands.length - 1];
  const seatType = Object.keys(config.seatTypes)[0];
  // The spacing and pitch the hall already uses for that seat type, else the first band's.
  const sample =
    config.layout.bands
      .flatMap((band) => band.sections.map((section) => resolveSection(band, section)))
      .find((section) => section.seatType === seatType) ??
    (config.layout.bands[0] && config.layout.bands[0].sections[0]
      ? resolveSection(config.layout.bands[0], config.layout.bands[0].sections[0])
      : undefined);
  const build = (rows: number, seatsPerRow: number, depth = config.hall.depth): unknown => {
    const band: BandConfig = {
      id,
      ...(previous?.riserHeight !== undefined ? { riserHeight: previous.riserHeight } : {}),
      defaults: {
        rows,
        rowSpacing: sample?.rowSpacing ?? 0.95,
        seatPitch: sample?.seatPitch ?? 0.6,
        ...(seatType !== undefined ? { seatType } : {}),
      },
      sections: [{ id: sectionId, seatsPerRow }],
    };
    const next = [...bands];
    next.splice(index, 0, band);
    const candidate = replaceBands(config, next) as HallConfig;
    return depth === config.hall.depth
      ? candidate
      : { ...candidate, hall: { ...candidate.hall, depth } };
  };
  const before = fitParts(config, fit) ?? { width: 0, depth: 0, required: 0 };
  // Seats first, on one row: the width does not depend on the row count.
  let seats = 1;
  let leastWidth = Number.POSITIVE_INFINITY;
  for (const candidate of NEW_BAND_SEATS) {
    const parts = fitParts(build(1, candidate), fit);
    if (parts === null) continue;
    if (parts.width <= before.width + FIT_EPSILON) {
      seats = candidate;
      break;
    }
    if (parts.width < leastWidth) {
      leastWidth = parts.width;
      seats = candidate;
    }
  }
  let rows: number | undefined;
  let leastDepth: { rows: number; depth: number } | undefined;
  for (const candidate of NEW_BAND_ROWS) {
    const parts = fitParts(build(candidate, seats), fit);
    if (parts === null) continue;
    if (parts.depth <= before.depth + FIT_EPSILON) {
      rows = candidate;
      break;
    }
    if (leastDepth === undefined || parts.depth < leastDepth.depth)
      leastDepth = { rows: candidate, depth: parts.depth };
  }
  if (rows !== undefined) return build(rows, seats);
  if (opts.growHall) {
    const preferred = NEW_BAND_ROWS[0];
    const parts = fitParts(build(preferred, seats), fit);
    if (parts !== null && parts.depth > 0) {
      return build(preferred, seats, roundUp(Math.max(config.hall.depth, parts.required)));
    }
  }
  return build(leastDepth?.rows ?? 1, seats);
}

/**
 * Removes a band.
 * @param config Current hall.
 * @param id Band id.
 * @returns The candidate config.
 */
export function removeBand(config: HallConfig, id: string): unknown {
  const { index } = findBand(config, id);
  return replaceBands(
    config,
    config.layout.bands.filter((_, position) => position !== index),
  );
}

/**
 * Moves a band to a position.
 * @param config Current hall.
 * @param id Band id.
 * @param toIndex New index.
 * @returns The candidate config.
 */
export function moveBand(config: HallConfig, id: string, toIndex: number): unknown {
  const { index } = findBand(config, id);
  return replaceBands(config, moveItem(config.layout.bands, index, toIndex));
}

/**
 * Copies a band and all its sections under fresh ids, placed right after the original.
 * @param config Current hall.
 * @param id Band id.
 * @returns The candidate config.
 */
export function duplicateBand(config: HallConfig, id: string): unknown {
  const { index, band } = findBand(config, id);
  const taken = structureIds(config);
  const copyId = uniqueId(`${id}-copy`, taken);
  taken.add(copyId);
  const sections = band.sections.map((section) => {
    const sectionId = uniqueId(`${section.id}-copy`, taken);
    taken.add(sectionId);
    return { ...structuredClone(section), id: sectionId };
  });
  const copy = { ...structuredClone(band), id: copyId, sections };
  const bands = [...config.layout.bands];
  bands.splice(index + 1, 0, copy);
  return replaceBands(config, bands);
}

/**
 * Deep-merges a patch into a band.
 * @param config Current hall.
 * @param id Band id.
 * @param patch Partial band.
 * @returns The candidate config.
 */
export function patchBand(config: HallConfig, id: string, patch: unknown): unknown {
  const { index, band } = findBand(config, id);
  return replaceBands(
    config,
    config.layout.bands.map((item, position) =>
      position === index ? applyPatch(band, patch) : item,
    ),
  );
}

/** Rounds to 5 cm, up or down, so suggested positions are tidy numbers. */
function round5(metres: number, direction: 'up' | 'down'): number {
  const scaled = metres * 20;
  return (direction === 'up' ? Math.ceil(scaled - 1e-6) : Math.floor(scaled + 1e-6)) / 20;
}

/** What placing a band as a balcony depends on: the bands in front, its depth and the thresholds. */
function balconyContext(config: HallConfig, id: string, overrides?: Partial<Constraints>) {
  const { index, band } = findBand(config, id);
  if (index === 0) return null;
  const constraints = resolveConstraints(config, { constraints: overrides });
  // The layout as if the band were not lifted, so a band that already is one gets the same answer.
  const flat = buildHallLayout(
    replaceBands(
      config,
      config.layout.bands.map((item, position) => {
        if (position !== index) return item;
        const { startDistance: _start, elevation: _elevation, ...rest } = item;
        return rest;
      }),
    ) as HallConfig,
  );
  const sections = band.sections.map((section) => resolveSection(band, section));
  const spacing = Math.max(0.1, ...sections.map((section) => section.rowSpacing));
  const rows = Math.max(1, ...sections.map((section) => section.rows));
  const seatDepth = Math.max(
    0.5,
    ...sections.map((section) => config.seatTypes[section.seatType]?.depth ?? 0.5),
  );
  const front = flat.bands.slice(0, index);
  return { config, index, constraints, front, spacing, span: (rows - 1) * spacing, seatDepth };
}

/**
 * The lowest floor of the band, placed at `startDistance` and `elevation`, that leaves the
 * headroom over every lower seat under its slab, measured as the `layout.bandOverlap` rule does: over
 * the whole slab the 3D view draws (`balconySlabSteps`, back to the next balcony or the back wall),
 * against each seat's body. Undefined when no lower seat is under the slab.
 */
function slabFloor(
  context: NonNullable<ReturnType<typeof balconyContext>>,
  startDistance: number,
  elevation: number,
): number | undefined {
  const { config, index, constraints } = context;
  const id = config.layout.bands[index]!.id;
  const layout = buildHallLayout(
    replaceBands(
      config,
      config.layout.bands.map((item, position) =>
        position === index ? { ...item, startDistance, elevation } : item,
      ),
    ) as HallConfig,
  );
  const level = layout.bands[index]?.level ?? 0;
  if (level < 1) return undefined;
  const steps = balconySlabSteps(layout).filter((step) => step.bandId === id);
  const need = constraints.minOverhangClearance + constraints.balconySlabThickness;
  const meets = (aMin: number, aMax: number, bMin: number, bMax: number) =>
    aMax - aMin <= 1e-9
      ? aMin >= bMin - 1e-9 && aMin <= bMax + 1e-9
      : Math.min(aMax, bMax) - Math.max(aMin, bMin) > 1e-9;
  let floor: number | undefined;
  for (const seat of layout.seats) {
    if (seat.level >= level) continue;
    const type = layout.seatTypes[seat.seatTypeId];
    const halfWidth = (type?.width ?? 0) / 2;
    const halfDepth = (type?.depth ?? 0) / 2;
    const { x, y, z } = seat.position;
    for (const step of steps) {
      if (!meets(x - halfWidth, x + halfWidth, step.minX, step.maxX)) continue;
      if (!meets(z - halfDepth, z + halfDepth, step.minZ, step.maxZ)) continue;
      // The step's floor rises with the band's floor: what the band needs for this seat.
      const required = y + need - (step.floor - elevation);
      floor = floor === undefined ? required : Math.max(floor, required);
    }
  }
  return floor;
}

/** The lowest floor that keeps the headroom over every band in front that the range covers. */
function clearanceFloor(
  context: NonNullable<ReturnType<typeof balconyContext>>,
  startDistance: number,
): number {
  const { constraints, front, spacing, span } = context;
  const minZ = startDistance - spacing / 2;
  const maxZ = startDistance + span + spacing / 2;
  const under = front.filter(
    (item) => Math.min(item.maxZ, maxZ) - Math.max(item.minZ, minZ) > 1e-9,
  );
  const floor = Math.max(
    ...(under.length ? under : front.slice(-1)).map((item) => item.topElevation),
  );
  let elevation = round5(
    floor + constraints.minOverhangClearance + constraints.balconySlabThickness,
    'up',
  );
  // The slab, and so the seats under it, depends on the floor height (it decides the level and the
  // balconies it runs back to): settle on a height whose own slab needs no more.
  for (let attempt = 0; attempt < 4; attempt++) {
    const required = slabFloor(context, startDistance, elevation);
    if (required === undefined) break;
    const next = round5(required, 'up');
    if (Math.abs(next - elevation) < 1e-9) break;
    elevation = next;
  }
  return elevation;
}

/**
 * Where a band goes when it is turned into an upper level (a balcony) over the bands in front of
 * it. `startDistance` puts its first row over the rear of the bands in front, as far back as the
 * hall lets its last row fit (with `minRearClearance`), but never behind the last row of the band
 * just in front and never in front of the first band. `elevation` is the highest top floor of the
 * bands under it plus `minOverhangClearance` and `balconySlabThickness`, so the seats below keep
 * their headroom. Both are rounded to 5 cm.
 * @param config Current hall.
 * @param id Band id.
 * @param overrides The editor's constraint overrides.
 * @returns The suggested start distance and floor height; null for the first band.
 */
export function balconyPlacement(
  config: HallConfig,
  id: string,
  overrides?: Partial<Constraints>,
): { startDistance: number; elevation: number } | null {
  const context = balconyContext(config, id, overrides);
  if (context === null) return null;
  const { constraints, front, spacing, span, seatDepth } = context;
  const previous = front[front.length - 1]!;
  const firstMinZ = Math.min(...front.map((item) => item.minZ));
  const fromBack = config.hall.depth - constraints.minRearClearance - seatDepth / 2 - span;
  const startDistance = Math.max(
    0.05,
    round5(
      Math.max(firstMinZ + spacing / 2, Math.min(fromBack, previous.maxZ - spacing / 2)),
      'down',
    ),
  );
  return { startDistance, elevation: clearanceFloor(context, startDistance) };
}

/**
 * The lowest floor height of a band placed at `startDistance` that leaves `minOverhangClearance`
 * (plus `balconySlabThickness`) over the bands in front of it that it covers, rounded up to 5 cm.
 * @param config Current hall.
 * @param id Band id.
 * @param startDistance Where its first row is.
 * @param overrides The editor's constraint overrides.
 * @returns The floor height, or null for the first band.
 */
export function balconyMinElevation(
  config: HallConfig,
  id: string,
  startDistance: number,
  overrides?: Partial<Constraints>,
): number | null {
  const context = balconyContext(config, id, overrides);
  return context === null ? null : clearanceFloor(context, startDistance);
}
