import { balconySlabSteps, type BalconySlabStep } from '../../band-geometry.js';
import type { Issue } from '../../issues.js';
import type { BandBox, BuiltSeat, Vec3 } from '../../layout.js';
import type { ValidationRule } from '../../validation.js';
import { resolveRuleContext } from '../context.js';
import { bandName, EPS, exceeds, sectionEntries, sectionName, sectionPath } from '../helpers.js';
import { makeIssue } from '../issue-helpers.js';
import { overlappingBandPairs, sectionsOfBand } from './band-pairs.js';

/** Height of the line from `eye` to the top edge of the screen (at z = 0) at depth `z`. */
function lineAt(eye: Vec3, top: number, z: number): number {
  return eye.y + ((top - eye.y) * (eye.z - z)) / eye.z;
}

/**
 * True when the line from `eye` to the top of the screen passes above the underside of a slab step
 * somewhere between the screen and the eye. The line is straight, so it is highest over the step at
 * one of the step's ends; the end at the eye itself is left to `layout.bandOverlap`.
 */
function stepBlocks(step: BalconySlabStep, eye: Vec3, top: number, thickness: number): boolean {
  if (eye.x < step.minX - EPS || eye.x > step.maxX + EPS || step.minZ >= eye.z) return false;
  const underside = step.floor - thickness;
  if (exceeds(lineAt(eye, top, step.minZ), underside)) return true;
  return step.maxZ < eye.z && exceeds(lineAt(eye, top, step.maxZ), underside);
}

/**
 * A band that hangs over another one (a balcony) must not hide the top of the screen from the rows
 * under it. A balcony (a band of level 1 and up) is measured over its whole floor slab as the 3D
 * view draws it (see `balconySlabSteps`): every step's underside (its row's floor minus
 * `balconySlabThickness`), across the hall's width and back to the next balcony or the back wall,
 * for every seat of a lower level, including seats beside or behind the balcony's own seats. A band
 * that overlaps a lower band in plan but stays on level 0 has no slab; the obstacle is then the
 * front edge of its underside over its own sections.
 */
export const viewOverhangRule: ValidationRule = {
  code: 'view.overhang',
  /**
   * Reports `view.overhang` as a warning, at most once per section of the lower band: at the first
   * row whose line of sight from the eye to the top edge of the screen passes above the underside
   * of the band over it. `rowLabel` is the row, `section` the section and `band` the upper band.
   */
  check(ctx) {
    const { config, constraints, layout } = resolveRuleContext(ctx);
    const top = layout.screen.elevation + layout.screen.height;
    const thickness = constraints.balconySlabThickness;
    const firstBlocked = new Map<string, { seat: BuiltSeat; band: string }>();
    const blocked = (upper: BandBox, seat: BuiltSeat) => {
      const known = firstBlocked.get(seat.sectionId);
      if (known === undefined || seat.sectionRow < known.seat.sectionRow) {
        firstBlocked.set(seat.sectionId, {
          seat,
          band: bandName(config.layout.bands[upper.index]!),
        });
      }
    };

    const steps = balconySlabSteps(layout);
    for (const upper of layout.bands) {
      if (upper.level < 1) continue;
      const own = steps.filter((step) => step.bandId === upper.id);
      for (const seat of layout.seats) {
        if (seat.level >= upper.level) continue;
        if (own.some((step) => stepBlocks(step, seat.eye, top, thickness))) blocked(upper, seat);
      }
    }
    // A band that overlaps a lower one in plan but is not a balcony: its front edge, over its
    // own sections.
    for (const { upper, lower } of overlappingBandPairs(config, layout)) {
      if (upper.level >= 1) continue;
      const boxes = sectionsOfBand(layout, upper.id);
      const minX = Math.min(...boxes.map((box) => box.minX));
      const maxX = Math.max(...boxes.map((box) => box.maxX));
      const edgeZ = upper.minZ;
      const underside = upper.floorElevation - thickness;
      for (const seat of layout.seats) {
        if (seat.bandId !== lower.id) continue;
        const { eye } = seat;
        if (eye.z <= edgeZ || eye.x < minX || eye.x > maxX) continue;
        if (exceeds(lineAt(eye, top, edgeZ), underside)) blocked(upper, seat);
      }
    }

    const issues: Issue[] = [];
    for (const entry of sectionEntries(config)) {
      const found = firstBlocked.get(entry.resolved.id);
      if (found === undefined) continue;
      issues.push(
        makeIssue(config, 'warning', 'view.overhang', sectionPath(entry), {
          row: found.seat.sectionRow,
          rowLabel: found.seat.row,
          section: sectionName(entry.section),
          band: found.band,
        }),
      );
    }
    return issues;
  },
};
