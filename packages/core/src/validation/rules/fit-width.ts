import { resolveSection } from '../../layout.js';
import type { Issue } from '../../issues.js';
import type { ValidationRule } from '../../validation.js';
import { resolveRuleContext } from '../context.js';
import { bandName, exceeds, round2 } from '../helpers.js';
import { makeIssue } from '../issue-helpers.js';

/** The widest band (seats, pitch and aisles) plus both wall clearances must fit the hall. */
export const fitWidthRule: ValidationRule = {
  code: 'fit.width',
  /**
   * Reports `fit.width` for each band whose seats, seat pitch and aisles, plus both wall
   * clearances, are wider than the hall. The issue points at the band.
   */
  check(ctx) {
    const { config, constraints } = resolveRuleContext(ctx);
    const issues: Issue[] = [];
    config.layout.bands.forEach((band, bandIndex) => {
      const span = band.sections
        .map((section) => resolveSection(band, section))
        .reduce((sum, s, i) => sum + (i === 0 ? 0 : s.gapBefore) + s.seatsPerRow * s.seatPitch, 0);
      const required = span + 2 * constraints.minWallClearance;
      if (exceeds(required, config.hall.width)) {
        issues.push(
          makeIssue(config, 'error', 'fit.width', ['layout', 'bands', bandIndex], {
            required: round2(required),
            available: round2(config.hall.width),
            band: bandName(band),
          }),
        );
      }
    });
    return issues;
  },
};
