import { pathToString, type Issue } from '@cinema-hall/core';
import { partClass } from '../provider/provider.js';
import { formatLabel } from '../labels/labels.js';
import { useHallEditorContext, type FocusControl } from './context.js';
import { describeIssue, groupIssues, issueFocusTarget, issuePlace } from './issues-view.js';
import { IssueFixButton } from './ui/IssueFixButton.js';

/** Optional host class for the issues list. */
export interface HallConstructorIssuesProps {
  /** Class appended to the issues part. */
  className?: string;
}

/**
 * Editor and server issues grouped by severity; clicking selects the object and focuses its field.
 * Each issue about a band or section names it, so issues with the same text can be told apart, and an
 * issue with a one-click fix (a hall too small for its seats) offers it.
 * @param props Optional class appended to the issues part.
 * @param props.className Class appended to the part.
 * @returns The control or panel inside HallConstructorRoot.
 * @example <HallConstructorIssues />
 */
export function HallConstructorIssues({ className }: HallConstructorIssuesProps) {
  const { editor, save, options, focus } = useHallEditorContext();
  const L = options.labels.editor;
  const all: Issue[] = [...editor.issues, ...save.serverIssues];
  const { errors, warnings } = groupIssues(all);
  return (
    <section
      data-chk="editor-issues"
      aria-label={formatLabel(L.issuesTitle)}
      className={partClass(options, 'editorIssues', className)}
    >
      <h3 data-chk="editor-subtitle">{formatLabel(L.issuesTitle)}</h3>
      {all.length === 0 ? <p data-chk="editor-empty">{formatLabel(L.noIssues)}</p> : null}
      {errors.length > 0 ? (
        <IssueGroup
          severity="error"
          title={formatLabel(L.errorsGroup, { count: errors.length })}
          issues={errors}
          focus={focus}
        />
      ) : null}
      {warnings.length > 0 ? (
        <IssueGroup
          severity="warning"
          title={formatLabel(L.warningsGroup, { count: warnings.length })}
          issues={warnings}
          focus={focus}
        />
      ) : null}
    </section>
  );
}

interface IssueGroupProps {
  severity: 'error' | 'warning';
  title: string;
  issues: Issue[];
  focus: FocusControl;
}

function IssueGroup({ severity, title, issues, focus }: IssueGroupProps) {
  const { options, editor } = useHallEditorContext();
  const { Button } = options.slots;
  const L = options.labels.editor;
  return (
    <div data-chk="editor-issue-group" data-severity={severity}>
      <h4>{title}</h4>
      <ul>
        {issues.map((issue, index) => (
          <li key={`${issue.code}-${pathToString(issue.path)}-${index}`}>
            <IssueItem
              place={issuePlace(issue, editor.config, L)}
              text={describeIssue(issue, L, options.locale, options.labels.issues)}
              Button={Button}
              onActivate={() => {
                const target = issueFocusTarget(issue, editor.config);
                focus.requestFocus(target.path, target.ref);
              }}
            />
            <IssueFixButton issue={issue} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One issue as a button: the message, and where it is when it is about a band or a section. The
 * place is part of the button's name, so issues with the same text have different names.
 */
function IssueItem({
  place,
  text,
  Button,
  onActivate,
}: {
  place: string | null;
  text: string;
  Button: ReturnType<typeof useHallEditorContext>['options']['slots']['Button'];
  onActivate: () => void;
}) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onActivate}>
      {place !== null ? (
        <span data-chk="editor-issue-text">
          <span data-chk="editor-issue-place">{place}</span>
          <span className="chk-visually-hidden">: </span>
          <span>{text}</span>
        </span>
      ) : (
        text
      )}
    </Button>
  );
}
