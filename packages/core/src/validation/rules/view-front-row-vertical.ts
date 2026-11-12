import type { ValidationRule } from '../../validation.js';
import { exceeds, round2, toDegrees } from '../helpers.js';
import { makeIssue } from '../issue-helpers.js';

/** From the eye of the first row, the angle up to the top edge of the screen must stay small. */
export const viewFrontRowVerticalRule: ValidationRule = {
  code: 'view.frontRowVertical',
  /**
   * Reports `view.frontRowVertical` as a warning when the angle, in degrees, from the eye of the
   * first row up to the top edge of the screen is above `maxFrontRowVerticalAngle`.
   */
  check({ config, constraints, layout }) {
    const top = config.screen.elevation + config.screen.height;
    const angle = toDegrees(Math.atan2(top - layout.eyeHeight, config.layout.firstRowDistance));
    if (!exceeds(angle, constraints.maxFrontRowVerticalAngle)) return [];
    return [
      makeIssue(config, 'warning', 'view.frontRowVertical', ['layout', 'firstRowDistance'], {
        limit: constraints.maxFrontRowVerticalAngle,
        actual: round2(angle),
      }),
    ];
  },
};
