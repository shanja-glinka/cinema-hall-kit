import type { ValidationRule } from '../../validation.js';
import { below, round2 } from '../helpers.js';
import { makeIssue } from '../issue-helpers.js';

/** The first row should sit far enough from the screen relative to the screen width. */
export const viewFirstRowTooCloseRule: ValidationRule = {
  code: 'view.firstRowTooClose',
  /**
   * Reports `view.firstRowTooClose` as a warning when the first-row distance divided by the screen
   * width is below `minFirstRowDistanceRatio`.
   */
  check({ config, constraints }) {
    const ratio = config.layout.firstRowDistance / config.screen.width;
    if (!below(ratio, constraints.minFirstRowDistanceRatio)) return [];
    return [
      makeIssue(config, 'warning', 'view.firstRowTooClose', ['layout', 'firstRowDistance'], {
        required: round2(constraints.minFirstRowDistanceRatio),
        available: round2(ratio),
      }),
    ];
  },
};
