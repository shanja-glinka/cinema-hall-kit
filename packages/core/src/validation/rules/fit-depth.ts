import type { Seat } from '../../layout.js';
import type { ValidationRule } from '../../validation.js';
import { resolveRuleContext } from '../context.js';
import { bandName, exceeds, round2 } from '../helpers.js';
import { makeIssue } from '../issue-helpers.js';

/** The rearmost seat (centre plus half its depth) plus the rear clearance must fit the hall. */
export const fitDepthRule: ValidationRule = {
  code: 'fit.depth',
  /**
   * Reports `fit.depth` when the reach of the rearmost seat (its centre plus half its depth) plus
   * `minRearClearance` is deeper than the hall. A hall with no seats passes. The issue stays at
   * `hall.depth`; its `ref` and the `band` param name the band of the rearmost seat, whose rows
   * can be removed instead.
   */
  check(ctx) {
    const { config, constraints, layout } = resolveRuleContext(ctx);
    let deepest = Number.NEGATIVE_INFINITY;
    let rearmost: Seat | undefined;
    for (const seat of layout.seats) {
      const reach = seat.position.z + layout.seatTypes[seat.seatTypeId]!.depth / 2;
      if (reach > deepest) {
        deepest = reach;
        rearmost = seat;
      }
    }
    if (rearmost === undefined) return [];
    const required = deepest + constraints.minRearClearance;
    if (!exceeds(required, config.hall.depth)) return [];
    const band = config.layout.bands.find((item) => item.id === rearmost.bandId)!;
    const issue = makeIssue(config, 'error', 'fit.depth', ['hall', 'depth'], {
      required: round2(required),
      available: round2(config.hall.depth),
      band: bandName(band),
    });
    return [{ ...issue, ref: { bandId: band.id } }];
  },
};
