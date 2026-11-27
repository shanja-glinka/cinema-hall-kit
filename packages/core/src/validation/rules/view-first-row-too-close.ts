import type { ValidationRule } from '../../validation.js';
import { resolveRuleContext } from '../context.js';
import { below, nearestRow, round2 } from '../helpers.js';
import { makeIssue } from '../issue-helpers.js';

/** The first row should sit far enough from the screen relative to the screen width. */
export const viewFirstRowTooCloseRule: ValidationRule = {
  code: 'view.firstRowTooClose',
  /**
   * Reports `view.firstRowTooClose` as a warning when the first-row distance divided by the screen
   * width is below `minFirstRowDistanceRatio`. The first row is the occupied row closest to the
   * screen, whichever band it belongs to; the issue points at the field that positions it (the
   * `startDistance` of the band that starts its run, or `layout.firstRowDistance`).
   */
  check(ctx) {
    const { config, constraints, layout } = resolveRuleContext(ctx);
    const { distance, path } = nearestRow(config, layout);
    const ratio = distance / config.screen.width;
    if (!below(ratio, constraints.minFirstRowDistanceRatio)) return [];
    return [
      makeIssue(config, 'warning', 'view.firstRowTooClose', path, {
        required: round2(constraints.minFirstRowDistanceRatio),
        available: round2(ratio),
      }),
    ];
  },
};
