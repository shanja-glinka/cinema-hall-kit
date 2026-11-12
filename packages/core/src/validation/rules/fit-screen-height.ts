import type { ValidationRule } from '../../validation.js';
import { exceeds, round2 } from '../helpers.js';
import { makeIssue } from '../issue-helpers.js';

/** The top edge of the screen must be below the ceiling. */
export const fitScreenHeightRule: ValidationRule = {
  code: 'fit.screenHeight',
  /** Reports `fit.screenHeight` when the top edge of the screen is above the hall height. */
  check({ config }) {
    const top = config.screen.elevation + config.screen.height;
    if (!exceeds(top, config.hall.height)) return [];
    return [
      makeIssue(config, 'error', 'fit.screenHeight', ['screen', 'height'], {
        required: round2(top),
        available: round2(config.hall.height),
      }),
    ];
  },
};
