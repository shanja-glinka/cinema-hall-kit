import type { Issue } from '../../issues.js';
import type { ScreenGeometry, Seat } from '../../layout.js';
import type { ValidationRule } from '../../validation.js';
import { EPS, exceeds, sectionEntries, sectionPath } from '../helpers.js';
import { makeIssue } from '../issue-helpers.js';

/**
 * The head of a viewer in front must not hide the bottom edge of the screen from the viewer behind.
 * Every seat in front of a seat in the same column (x within half the seat pitch of its section,
 * in any band, at any distance) is tested: a head in a farther row can block a sightline that the
 * nearest row clears. Reports at most one issue per section: its first blocked row.
 */
export const viewSightlineRule: ValidationRule = {
  code: 'view.sightline',
  /**
   * Reports `view.sightline` as a warning, at most once per section: at the first row whose view of
   * the bottom edge of the screen is blocked by a head in front of it.
   */
  check({ config, constraints, layout }) {
    const { screen } = layout;
    const firstBlocked = new Map<string, number>();
    for (const box of layout.sections) {
      const halfPitch = box.seatPitch / 2;
      for (const back of layout.seats) {
        if (back.sectionId !== box.sectionId) continue;
        if (back.eye.z - screen.curvature <= 0) continue;
        if (!blockedByAnyFront(back, halfPitch, layout.seats, screen, constraints.headAboveEye)) {
          continue;
        }
        const known = firstBlocked.get(box.sectionId);
        if (known === undefined || back.sectionRow < known) {
          firstBlocked.set(box.sectionId, back.sectionRow);
        }
      }
    }
    const issues: Issue[] = [];
    for (const entry of sectionEntries(config)) {
      const row = firstBlocked.get(entry.resolved.id);
      if (row !== undefined) {
        issues.push(makeIssue(config, 'warning', 'view.sightline', sectionPath(entry), { row }));
      }
    }
    return issues;
  },
};

/**
 * True when some seat in front of `back` in its column has a head above the sightline from the
 * eye of `back` to the bottom edge of the screen.
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
    if (front.eye.z >= back.eye.z) continue;
    if (Math.abs(front.eye.x - back.eye.x) > halfPitch + EPS) continue;
    const bottomLineY =
      back.eye.y + ((screen.elevation - back.eye.y) * (back.eye.z - front.eye.z)) / span;
    if (exceeds(front.eye.y + headAboveEye, bottomLineY)) return true;
  }
  return false;
}
