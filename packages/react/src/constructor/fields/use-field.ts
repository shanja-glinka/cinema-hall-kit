import { useId } from 'react';
import { fieldKeyForPath, pathToString, type FieldAccess, type Issue } from '@cinema-hall/core';
import { useHallEditorContext } from '../context.js';
import { describeIssue, issueFocusTarget } from '../issues-view.js';
import { formatLabel } from '../../labels/labels.js';

/** A concrete config path, including array indices. */
export type FieldPath = readonly (string | number)[];

/** Resolved policy, accessibility ids and issue text for one control. */
export interface FieldState {
  readonly id: string;
  readonly messageId: string;
  /** `data-chk-path` value: the focus target of issues about this field. */
  readonly path: string;
  readonly access: FieldAccess;
  readonly hidden: boolean;
  readonly disabled: boolean;
  /** `aria-invalid`: a local rejection or an error on this path. */
  readonly invalid: boolean;
  /** The message under the field: a local rejection, the issue, or the lock hint. */
  readonly text: string | null;
  readonly describedBy: string | undefined;
  /** The issue shown under the field, when there is one. */
  readonly issue?: Issue;
}

function samePath(a: readonly (string | number)[], b: FieldPath): boolean {
  return a.length === b.length && a.every((part, index) => part === b[index]);
}

/**
 * Resolves field access, ids and messages from client and server issues.
 * @param path Config field path.
 * @param local Local draft rejection, when present.
 * @returns Field access and presentation state.
 * @example const field = useField(["hall", "width"]);
 */
export function useField(path: FieldPath, local: string | null = null): FieldState {
  const ctx = useHallEditorContext();
  const id = useId();
  const key = fieldKeyForPath(path);
  const access: FieldAccess = key === null ? 'editable' : (ctx.editor.policy[key] ?? 'editable');
  // Client issues and the server's answer both apply to the field. An error outranks a warning.
  const matching: Issue[] = [...ctx.editor.issues, ...ctx.save.serverIssues].filter(
    (item) =>
      samePath(item.path, path) || samePath(issueFocusTarget(item, ctx.editor.config).path, path),
  );
  const issue: Issue | undefined =
    matching.find((item) => item.severity === 'error') ?? matching[0];
  const issueText = issue
    ? describeIssue(issue, ctx.options.labels.editor, ctx.options.locale, ctx.options.labels.issues)
    : null;
  const lockText = access === 'locked' ? formatLabel(ctx.options.labels.editor.locked) : null;
  const text = local ?? issueText ?? lockText;
  const messageId = `${id}-message`;
  return {
    id,
    messageId,
    path: pathToString(path),
    access,
    hidden: access === 'hidden',
    disabled: ctx.readOnly || access === 'locked',
    invalid: local !== null || matching.some((item) => item.severity === 'error'),
    text,
    describedBy: text ? messageId : undefined,
    ...(local === null && issue !== undefined ? { issue } : {}),
  };
}
