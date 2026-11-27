import type { Seat } from '../../layout.js';
import type { ValidationRule } from '../../validation.js';
import { resolveRuleContext } from '../context.js';
import { bandName, exceeds, round2 } from '../helpers.js';
import { makeIssue } from '../issue-helpers.js';

/**
 * The highest eye point plus the minimum headroom must fit under the ceiling. Elevated bands (a
 * balcony) count with their own floor heights.
 */
export const fitHeadroomRule: ValidationRule = {
  code: 'fit.headroom',
  /**
   * Reports `fit.headroom` when the highest eye point plus `minHeadroom` is above the hall height.
   * A hall with no seats passes. The issue is at `hall.height` with no `ref`, so a UI that follows it
   * opens the hall height field; the `band` param names the band of the highest seat for the text.
   */
  check(ctx) {
    const { config, constraints, layout } = resolveRuleContext(ctx);
    let highestEye = Number.NEGATIVE_INFINITY;
    let highest: Seat | undefined;
    for (const seat of layout.seats) {
      if (seat.eye.y > highestEye) {
        highestEye = seat.eye.y;
        highest = seat;
      }
    }
    if (highest === undefined) return [];
    const required = highestEye + constraints.minHeadroom;
    if (!exceeds(required, config.hall.height)) return [];
    const band = config.layout.bands.find((item) => item.id === highest.bandId)!;
    return [
      makeIssue(config, 'error', 'fit.headroom', ['hall', 'height'], {
        required: round2(required),
        available: round2(config.hall.height),
        band: bandName(band),
      }),
    ];
  },
};
