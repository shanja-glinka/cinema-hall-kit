import type { Issue } from '../../issues.js';
import type { ScreenGeometry, Seat } from '../../layout.js';
import { BALCONY_PARAPET_THICKNESS } from '../../schema.js';
import type { ValidationRule } from '../../validation.js';
import { resolveRuleContext } from '../context.js';
import { EPS, exceeds, sectionEntries, sectionName, sectionPath } from '../helpers.js';
import { makeIssue } from '../issue-helpers.js';

/**
 * The front barrier of a balcony band: its level, the distances from the screen of its screen-side
 * face (`frontZ`) and of its back face at the band's front edge (`backZ`), and the height of its
 * top.
 */
interface Parapet {
  level: number;
  frontZ: number;
  backZ: number;
  y: number;
}

/**
 * The head of a viewer in front must not hide the bottom edge of the screen from the viewer behind.
 * Every seat in front of a seat in the same column (x within half the seat pitch of its section,
 * in any band of the same level, at any distance) is tested: a head in a farther row can block a
 * sightline that the nearest row clears. Seats on another level (a balcony above or the stalls
 * below) are not compared. Every balcony band (level 1 and up) has a front barrier across the hall's
 * width, `balconyParapetHeight` above the floor of its first row, from the front edge of the band
 * `BALCONY_PARAPET_THICKNESS` toward the screen, as the 3D view draws it; its flat top is tested
 * over that whole depth. For a balcony seat, the barriers of its own band and of every balcony
 * band in front of it on its level or below are obstacles too; a ground-floor band raised with
 * `elevation` has no barrier. Reports at most one issue per section: its first blocked row.
 */
export const viewSightlineRule: ValidationRule = {
  code: 'view.sightline',
  /**
   * Reports `view.sightline` as a warning, at most once per section: at the first row whose view of
   * the bottom edge of the screen is blocked by a head in front of it or by the front barrier of a
   * balcony band in front of it (its own band's or an earlier one's). `row` is the row number within the section and `rowLabel` its label.
   */
  check(ctx) {
    const { config, constraints, layout } = resolveRuleContext(ctx);
    const { screen } = layout;
    const parapets: Parapet[] = [];
    for (const band of layout.bands) {
      // Only a balcony (level 1 and up) has a front barrier, as in the 3D view: a ground-floor band
      // raised with `elevation` restarts its rake but has no barrier in front of it.
      if (band.level >= 1) {
        parapets.push({
          level: band.level,
          frontZ: band.minZ - BALCONY_PARAPET_THICKNESS,
          backZ: band.minZ,
          y: band.floorElevation + constraints.balconyParapetHeight,
        });
      }
    }
    const firstBlocked = new Map<string, Seat>();
    for (const box of layout.sections) {
      const halfPitch = box.seatPitch / 2;
      for (const back of layout.seats) {
        if (back.sectionId !== box.sectionId) continue;
        if (back.eye.z - screen.curvature <= 0) continue;
        const blocked =
          blockedByAnyFront(back, halfPitch, layout.seats, screen, constraints.headAboveEye) ||
          (back.level >= 1 &&
            parapets.some(
              (parapet) => parapet.level <= back.level && blockedByParapet(back, parapet, screen),
            ));
        if (!blocked) continue;
        const known = firstBlocked.get(box.sectionId);
        if (known === undefined || back.sectionRow < known.sectionRow) {
          firstBlocked.set(box.sectionId, back);
        }
      }
    }
    const issues: Issue[] = [];
    for (const entry of sectionEntries(config)) {
      const seat = firstBlocked.get(entry.resolved.id);
      if (seat !== undefined) {
        issues.push(
          makeIssue(config, 'warning', 'view.sightline', sectionPath(entry), {
            row: seat.sectionRow,
            rowLabel: seat.row,
            section: sectionName(entry.section),
          }),
        );
      }
    }
    return issues;
  },
};

/** Height of the line from `eye` to a point of the screen plane, at distance `z` from the screen. */
function lineHeightAt(eye: Seat['eye'], targetY: number, span: number, z: number): number {
  return eye.y + ((targetY - eye.y) * (eye.z - z)) / span;
}

/**
 * True when some seat of the same level in front of `back` in its column has a head above the
 * sightline from the eye of `back` to the bottom edge of the screen.
 */
function blockedByAnyFront(
  back: Seat,
  halfPitch: number,
  seats: readonly Seat[],
  screen: ScreenGeometry,
  headAboveEye: number,
): boolean {
  const span = back.eye.z - screen.curvature;
  for (const front of seats) {
    if (front.level !== back.level) continue;
    if (front.eye.z >= back.eye.z) continue;
    if (Math.abs(front.eye.x - back.eye.x) > halfPitch + EPS) continue;
    const bottomLineY = lineHeightAt(back.eye, screen.elevation, span, front.eye.z);
    if (exceeds(front.eye.y + headAboveEye, bottomLineY)) return true;
  }
  return false;
}

/**
 * True when a front barrier is between `back` and the screen and its top is above the sightline
 * from `back` to the screen bottom anywhere over its depth. The sightline is straight and the top
 * is flat, so testing both faces covers the whole top.
 */
function blockedByParapet(back: Seat, parapet: Parapet, screen: ScreenGeometry): boolean {
  if (parapet.frontZ >= back.eye.z) return false;
  const span = back.eye.z - screen.curvature;
  return [parapet.frontZ, Math.min(parapet.backZ, back.eye.z)].some((z) =>
    exceeds(parapet.y, lineHeightAt(back.eye, screen.elevation, span, z)),
  );
}
