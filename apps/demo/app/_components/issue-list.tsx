'use client';

import type { IssueView } from '@/lib/shared/types';
import { t } from '@/lib/shared/texts';

/**
 * Validation issues, errors first. Each row shows the message and, in words, where in the hall the
 * problem is. The technical detail (line and column, config path, issue code) is folded away
 * under "Technical details", for whoever edits the file by hand.
 * @param props The issues and an optional heading.
 * @returns The list, or nothing when there are no issues.
 */
export function IssueList({ issues, title }: { issues: readonly IssueView[]; title?: string }) {
  if (issues.length === 0) return null;
  const ordered = [...issues].sort(
    (a, b) => Number(b.severity === 'error') - Number(a.severity === 'error'),
  );
  return (
    <section className="issues" aria-label={title ?? t.issues.listLabel} data-testid="issues">
      {title ? <h3>{title}</h3> : null}
      <ul>
        {ordered.map((issue, index) => (
          <li key={`${issue.code}-${issue.path}-${index}`} data-severity={issue.severity}>
            <span className="issue-badge">
              {issue.severity === 'error' ? t.issues.error : t.issues.warning}
            </span>
            <div>
              <p>{issue.text}</p>
              {issue.place ? <p className="issue-place">{issue.place}</p> : null}
              {issue.position ? <p className="issue-where">{issue.position}</p> : null}
              <details className="issue-tech">
                <summary>{t.issues.technical}</summary>
                <p className="issue-where">
                  {issue.path ? <code>{issue.path}</code> : null}
                  <code>{issue.code}</code>
                </p>
              </details>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
