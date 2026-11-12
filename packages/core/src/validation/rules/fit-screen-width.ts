import type { ValidationRule } from '../../validation.js';
import { exceeds, round2 } from '../helpers.js';
import { makeIssue } from '../issue-helpers.js';

/** The screen must not be wider than the hall. */
export const fitScreenWidthRule: ValidationRule = {
  code: 'fit.screenWidth',
  /** Reports `fit.screenWidth` when the screen is wider than the hall. */
  check({ config }) {
    if (!exceeds(config.screen.width, config.hall.width)) return [];
    return [
      makeIssue(config, 'error', 'fit.screenWidth', ['screen', 'width'], {
        required: round2(config.screen.width),
        available: round2(config.hall.width),
      }),
    ];
  },
};
