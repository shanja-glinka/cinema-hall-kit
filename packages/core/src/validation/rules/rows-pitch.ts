import type { Issue } from '../../issues.js';
import type { ValidationRule } from '../../validation.js';
import { below, round2, sectionEntries, sectionName, sectionPath } from '../helpers.js';
import { makeIssue } from '../issue-helpers.js';

/** Seats in a row must not overlap: the pitch cannot be narrower than the seat. */
export const rowsPitchRule: ValidationRule = {
  code: 'rows.pitch',
  /**
   * Reports `rows.pitch` for each section whose seat pitch is narrower than the width of its seat
   * type, so that seats would overlap.
   */
  check({ config }) {
    const issues: Issue[] = [];
    for (const entry of sectionEntries(config)) {
      const width = config.seatTypes[entry.resolved.seatType]!.width;
      if (below(entry.resolved.seatPitch, width)) {
        issues.push(
          makeIssue(config, 'error', 'rows.pitch', sectionPath(entry), {
            required: round2(width),
            available: round2(entry.resolved.seatPitch),
            section: sectionName(entry.section),
          }),
        );
      }
    }
    return issues;
  },
};
