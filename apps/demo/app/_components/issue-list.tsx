import type { IssueView } from '@/lib/shared/types';

/**
 * Validation issues, errors first. Each row shows the English message, the place in the text for
 * syntax errors and the config path for the others.
 * @param props The issues and an optional heading.
 * @returns The list, or nothing when there are no issues.
 */
export function IssueList({ issues, title }: { issues: readonly IssueView[]; title?: string }) {
  if (issues.length === 0) return null;
  const ordered = [...issues].sort(
    (a, b) => Number(b.severity === 'error') - Number(a.severity === 'error'),
  );
  return (
    <section className="issues" aria-label={title ?? 'Validation results'} data-testid="issues">
      {title ? <h3>{title}</h3> : null}
      <ul>
        {ordered.map((issue, index) => (
          <li key={`${issue.code}-${issue.path}-${index}`} data-severity={issue.severity}>
            <span className="issue-badge">{issue.severity === 'error' ? 'Error' : 'Warning'}</span>
            <div>
              <p>{issue.text}</p>
              <p className="issue-where">
                {issue.position ? <span>{issue.position}</span> : null}
                {issue.path ? <code>{issue.path}</code> : null}
                <code>{issue.code}</code>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
