import type { Issue } from '../../issues.js';
import type { ValidationRule } from '../../validation.js';
import { below, round2, sectionEntries, sectionPath } from '../helpers.js';
import { makeIssue } from '../issue-helpers.js';

/** Rows of a section must leave enough space between the back of one seat and the next row. */
export const rowsLegroomRule: ValidationRule = {
  code: 'rows.legroom',
  /**
   * Reports `rows.legroom` for each section with more than one row whose legroom (row spacing minus
   * seat depth) is below `minLegroom`.
   */
  check({ config, constraints }) {
    const issues: Issue[] = [];
    for (const entry of sectionEntries(config)) {
      if (entry.resolved.rows <= 1) continue;
      const depth = config.seatTypes[entry.resolved.seatType]!.depth;
      const legroom = entry.resolved.rowSpacing - depth;
      if (below(legroom, constraints.minLegroom)) {
        issues.push(
          makeIssue(config, 'error', 'rows.legroom', sectionPath(entry), {
            required: round2(constraints.minLegroom),
            available: round2(legroom),
          }),
        );
      }
    }
    return issues;
  },
};
