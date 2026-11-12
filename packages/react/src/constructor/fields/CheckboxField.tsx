import type { Issue } from '@cinema-hall/core';
import { useHallEditorContext } from '../context.js';
import { describeIssue } from '../issues-view.js';
import { FieldFrame } from './FieldFrame.js';
import { useField, type FieldPath } from './use-field.js';
import { useScopedState } from './scoped-state.js';

/**
 * Props of a checkbox bound to a config path.
 */
export interface CheckboxFieldProps {
  path: FieldPath;
  label: string;
  checked: boolean;
  onCommit: (checked: boolean) => Issue[];
}

/**
 * A checkbox that commits on change and follows the edit policy.
 * @param props Path, label, current state and commit handler.
 * @param props.path Config path the control edits.
 * @param props.label Visible label of the control.
 * @param props.checked Current state.
 * @param props.onCommit Receives the new value and returns the rejecting issues (empty = applied).
 * @returns The labelled checkbox, or nothing when hidden.
 * @example <CheckboxField path={["constraints", "x"]} label="On" checked onCommit={set} />
 */
export function CheckboxField({ path, label, checked, onCommit }: CheckboxFieldProps) {
  const ctx = useHallEditorContext();
  const [message, setMessage] = useScopedState<string | null>(ctx.editor.generation, null);
  const field = useField(path, message);

  if (field.hidden) return null;
  return (
    <FieldFrame field={field} label={label}>
      <input
        id={field.id}
        type="checkbox"
        data-chk="editor-checkbox"
        data-chk-path={field.path}
        checked={checked}
        aria-invalid={field.invalid || undefined}
        aria-describedby={field.describedBy}
        disabled={field.disabled}
        onChange={(event) => {
          const first = onCommit(event.target.checked)[0];
          setMessage(
            first ? describeIssue(first, ctx.options.labels.editor, ctx.options.locale) : null,
          );
        }}
      />
    </FieldFrame>
  );
}
