import type { ValidationRule } from '../../validation.js';
import { exceeds, round2 } from '../helpers.js';
import { makeIssue } from '../issue-helpers.js';

/** The highest eye point plus the minimum headroom must fit under the ceiling. */
export const fitHeadroomRule: ValidationRule = {
  code: 'fit.headroom',
  /**
   * Reports `fit.headroom` when the highest eye point plus `minHeadroom` is above the hall height.
   * A hall with no seats passes.
   */
  check({ config, constraints, layout }) {
    let highestEye = Number.NEGATIVE_INFINITY;
    for (const seat of layout.seats) highestEye = Math.max(highestEye, seat.eye.y);
    if (highestEye === Number.NEGATIVE_INFINITY) return [];
    const required = highestEye + constraints.minHeadroom;
    if (!exceeds(required, config.hall.height)) return [];
    return [
      makeIssue(config, 'error', 'fit.headroom', ['hall', 'height'], {
        required: round2(required),
        available: round2(config.hall.height),
      }),
    ];
  },
};
