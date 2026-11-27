import { balconySlabSteps, type BalconySlabStep } from '../../band-geometry.js';
import type { Issue } from '../../issues.js';
import type { BandBox, BuiltHallLayout, BuiltSeat } from '../../layout.js';
import type { ValidationRule } from '../../validation.js';
import { resolveRuleContext } from '../context.js';
import { bandName, below, round2 } from '../helpers.js';
import { makeIssue } from '../issue-helpers.js';
import {
  bodiesMeet,
  collidingBandPairs,
  floorAbove,
  seatBody,
  sectionsOfBand,
} from './band-pairs.js';

/** The worst seat under one upper band, per lower band. */
interface Shortfall {
  upper: BandBox;
  lower: BandBox;
  seat: BuiltSeat;
  floor: number;
  shortfall: number;
  /** True when the two bands belong to one run (the upper one follows the lower one or the reverse). */
  sameRun: boolean;
}

/** The slab of one balcony: its steps and the box around them. */
interface Slab {
  steps: BalconySlabStep[];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * The slab steps of every balcony, by band id, so a lookup only scans the steps of one band and
 * skips a seat outside the slab's box at once.
 */
function slabsByBand(steps: readonly BalconySlabStep[]): Map<string, Slab> {
  const byBand = new Map<string, Slab>();
  for (const step of steps) {
    const slab = byBand.get(step.bandId);
    if (slab === undefined) {
      byBand.set(step.bandId, {
        steps: [step],
        minX: step.minX,
        maxX: step.maxX,
        minZ: step.minZ,
        maxZ: step.maxZ,
      });
      continue;
    }
    slab.steps.push(step);
    slab.minX = Math.min(slab.minX, step.minX);
    slab.maxX = Math.max(slab.maxX, step.maxX);
    slab.minZ = Math.min(slab.minZ, step.minZ);
    slab.maxZ = Math.max(slab.maxZ, step.maxZ);
  }
  return byBand;
}

/**
 * Lowest floor of the slab of one balcony above the body of `seat` (its seat type's width and
 * depth around its position, as `collidingBandPairs` compares seats), or `undefined` when the slab
 * does not cover it. A seat whose centre is in front of the slab but whose back reaches under it
 * counts. The slab is the one the 3D view draws (see `balconySlabSteps`): it spans the hall's
 * width and runs back to the next balcony or the back wall, not only over the balcony's seats.
 */
function slabFloorAbove(layout: BuiltHallLayout, slab: Slab, seat: BuiltSeat): number | undefined {
  const body = seatBody(layout, seat);
  if (!bodiesMeet(body, slab)) return undefined;
  let lowest: number | undefined;
  for (const step of slab.steps) {
    if (!bodiesMeet(body, step)) continue;
    if (lowest === undefined || step.floor < lowest) lowest = step.floor;
  }
  return lowest;
}

/**
 * A band that hangs over another one (a balcony) must leave room for the people under it: from the
 * floor of every row under it to its underside (its row's floor minus `balconySlabThickness`) there
 * must be at least `minOverhangClearance`. A balcony (a band of level 1 and up) is measured over its
 * whole floor slab as the 3D view draws it (see `balconySlabSteps`), across the hall's width and
 * back to the next balcony or the back wall; every seat of a lower level under it is checked. A band
 * that overlaps a lower band in plan but stays on the ground floor, and a band that overlaps another
 * band on its own level (two balconies at the same height in the same place), are measured over the
 * upper band's sections, so seats that would share a place are reported.
 */
export const layoutBandOverlapRule: ValidationRule = {
  code: 'layout.bandOverlap',
  /**
   * Reports `layout.bandOverlap` as an error, once per pair of an upper band and a band under it,
   * when a seat of the lower band has less than `minOverhangClearance` between its floor and the
   * underside of the upper band. The issue points at the upper band's `elevation` (or
   * `startDistance`, or the band). `required` is the floor height the upper band needs there,
   * `available` the one it has, `rowLabel` the row under it and `band` / `below` the names of the
   * two bands.
   */
  check(ctx) {
    const { config, constraints, layout } = resolveRuleContext(ctx);
    const need = constraints.minOverhangClearance + constraints.balconySlabThickness;
    const worst = new Map<string, Shortfall>();
    const consider = (
      upper: BandBox,
      seat: BuiltSeat,
      floor: number | undefined,
      sameRun = false,
    ) => {
      if (floor === undefined) return;
      const required = seat.position.y + need;
      if (!below(floor, required)) return;
      const shortfall = required - floor;
      const key = `${upper.index}:${seat.bandId}`;
      const known = worst.get(key);
      if (known === undefined || shortfall > known.shortfall) {
        const lower = layout.bands.find((band) => band.id === seat.bandId)!;
        worst.set(key, { upper, lower, seat, floor, shortfall, sameRun });
      }
    };

    const slabs = slabsByBand(balconySlabSteps(layout));
    for (const upper of layout.bands) {
      if (upper.level < 1) continue;
      const slab = slabs.get(upper.id);
      if (slab === undefined) continue;
      for (const seat of layout.seats) {
        if (seat.level >= upper.level) continue;
        consider(upper, seat, slabFloorAbove(layout, slab, seat));
      }
    }
    // A band that overlaps a lower one in plan but is not a balcony has no slab in the 3D view, two
    // bands on the same level (two balconies at the same height over the same rows) are not over
    // each other's slab, and a band placed so close behind the previous one that their seats
    // overlap is not over it either: measure them over the upper band's own sections, comparing
    // seat bodies, so seats that share a place are reported.
    for (const { upper, lower, sameRun } of collidingBandPairs(config, layout)) {
      if (!sameRun && upper.level >= 1 && lower.level < upper.level) continue;
      const boxes = sectionsOfBand(layout, upper.id);
      for (const seat of layout.seats) {
        if (seat.bandId !== lower.id) continue;
        consider(upper, seat, floorAbove(layout, boxes, seat), sameRun);
      }
    }

    const issues: Issue[] = [];
    const ordered = [...worst.values()].sort(
      (a, b) => a.upper.index - b.upper.index || a.lower.index - b.lower.index,
    );
    for (const { upper, lower, seat, floor, shortfall, sameRun } of ordered) {
      const band = config.layout.bands[upper.index]!;
      // A band that follows the lower one too closely is moved back with its gapBefore.
      const key =
        band.elevation !== undefined
          ? ['elevation']
          : band.startDistance !== undefined
            ? ['startDistance']
            : sameRun && upper.index > lower.index
              ? ['gapBefore']
              : [];
      issues.push(
        makeIssue(config, 'error', 'layout.bandOverlap', ['layout', 'bands', upper.index, ...key], {
          required: round2(floor + shortfall),
          available: round2(floor),
          rowLabel: seat.row,
          band: bandName(band),
          below: bandName(config.layout.bands[lower.index]!),
        }),
      );
    }
    return issues;
  },
};
