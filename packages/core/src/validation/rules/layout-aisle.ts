import type { Issue } from '../../issues.js';
import type { ValidationRule } from '../../validation.js';
import { resolveRuleContext } from '../context.js';
import { below, round2, sectionEntries, sectionName, sectionPath } from '../helpers.js';
import { makeIssue } from '../issue-helpers.js';

/** An aisle between sections of a band must be wide enough to walk through. */
export const layoutAisleRule: ValidationRule = {
  code: 'layout.aisle',
  /**
   * Reports `layout.aisle` as a warning for each section that has an aisle (a `gapBefore` above
   * zero) narrower than `minAisleWidth`. The first section of a band has no aisle on its left and
   * is skipped.
   */
  check(ctx) {
    const { config, constraints } = resolveRuleContext(ctx);
    const issues: Issue[] = [];
    for (const entry of sectionEntries(config)) {
      if (entry.sectionIndex === 0) continue;
      const gap = entry.resolved.gapBefore;
      if (gap > 0 && below(gap, constraints.minAisleWidth)) {
        issues.push(
          makeIssue(config, 'warning', 'layout.aisle', sectionPath(entry), {
            required: round2(constraints.minAisleWidth),
            available: round2(gap),
            section: sectionName(entry.section),
          }),
        );
      }
    }
    return issues;
  },
};
