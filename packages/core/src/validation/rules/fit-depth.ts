import type { ValidationRule } from '../../validation.js';
import { exceeds, round2 } from '../helpers.js';
import { makeIssue } from '../issue-helpers.js';

/** The rearmost seat (centre plus half its depth) plus the rear clearance must fit the hall. */
export const fitDepthRule: ValidationRule = {
  code: 'fit.depth',
  /**
   * Reports `fit.depth` when the reach of the rearmost seat (its centre plus half its depth) plus
   * `minRearClearance` is deeper than the hall. A hall with no seats passes.
   */
  check({ config, constraints, layout }) {
    let deepest = Number.NEGATIVE_INFINITY;
    for (const seat of layout.seats) {
      const reach = seat.position.z + layout.seatTypes[seat.seatTypeId]!.depth / 2;
      deepest = Math.max(deepest, reach);
    }
    if (deepest === Number.NEGATIVE_INFINITY) return [];
    const required = deepest + constraints.minRearClearance;
    if (!exceeds(required, config.hall.depth)) return [];
    return [
      makeIssue(config, 'error', 'fit.depth', ['hall', 'depth'], {
        required: round2(required),
        available: round2(config.hall.depth),
      }),
    ];
  },
};
