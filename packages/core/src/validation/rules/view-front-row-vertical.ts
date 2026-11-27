import type { ValidationRule } from '../../validation.js';
import { resolveRuleContext } from '../context.js';
import { exceeds, nearestRow, round2, toDegrees } from '../helpers.js';
import { makeIssue } from '../issue-helpers.js';

/** From the eye of the first row, the angle up to the top edge of the screen must stay small. */
export const viewFrontRowVerticalRule: ValidationRule = {
  code: 'view.frontRowVertical',
  /**
   * Reports `view.frontRowVertical` as a warning when the angle, in degrees, from the eye of the
   * first row up to the top edge of the screen is above `maxFrontRowVerticalAngle`. The first row is
   * the occupied row closest to the screen, at its own floor height; the issue points at the field
   * that positions it (see `view.firstRowTooClose`).
   */
  check(ctx) {
    const { config, constraints, layout } = resolveRuleContext(ctx);
    const top = config.screen.elevation + config.screen.height;
    const { distance, floor, path } = nearestRow(config, layout);
    const angle = toDegrees(Math.atan2(top - floor - layout.eyeHeight, distance));
    if (!exceeds(angle, constraints.maxFrontRowVerticalAngle)) return [];
    return [
      makeIssue(config, 'warning', 'view.frontRowVertical', path, {
        limit: constraints.maxFrontRowVerticalAngle,
        actual: round2(angle),
      }),
    ];
  },
};
