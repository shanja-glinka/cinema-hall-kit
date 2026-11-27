import type { Issue } from '@cinema-hall/core';
import { useHallEditorContext } from '../context.js';
import { describeIssue } from '../issues-view.js';
import { FieldFrame } from './FieldFrame.js';
import { useField, type FieldPath } from './use-field.js';
import { useScopedState } from './scoped-state.js';
import { useAppliedFlash } from './applied.js';

/**
 * One choice of a select field.
 */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * Props of a select bound to a config path.
 */
export interface SelectFieldProps {
  path: FieldPath;
  label: string;
  value: string | undefined;
  options: readonly SelectOption[];
  /** Receives the chosen value; `undefined` for the "inherit" option. */
  onCommit: (value: string | undefined) => Issue[];
  /** Adds an "inherit" option with this label (it commits `undefined`). */
  inheritLabel?: string;
  /** Muted help under the field. */
  hint?: string;
}

/**
 * A select that commits on change; an optional "inherit" choice commits `undefined`.
 * @param props Path, label, value, options and commit handler.
 * @param props.path Config path the control edits.
 * @param props.label Visible label of the control.
 * @param props.value Current value, or undefined when unset.
 * @param props.options The choices.
 * @param props.onCommit Receives the new value and returns the rejecting issues (empty = applied).
 * @param props.inheritLabel Label of the "inherit" choice, which commits `undefined`.
 * @param props.hint Muted help under the field.
 * @returns The labelled select, or nothing when hidden.
 * @example <SelectField path={["a"]} label="Type" value="x" options={[{ value: "x", label: "X" }]} onCommit={set} />
 */
export function SelectField({
  path,
  label,
  value,
  options,
  onCommit,
  inheritLabel,
  hint,
}: SelectFieldProps) {
  const ctx = useHallEditorContext();
  const [message, setMessage] = useScopedState<string | null>(ctx.editor.generation, null);
  const field = useField(path, message);
  const [applied, markApplied] = useAppliedFlash();

  if (field.hidden) return null;
  return (
    <FieldFrame field={field} label={label} hint={hint} applied={applied}>
      <select
        id={field.id}
        data-chk="editor-select"
        data-chk-path={field.path}
        value={value ?? ''}
        aria-invalid={field.invalid || undefined}
        aria-describedby={field.describedBy}
        disabled={field.disabled}
        onChange={(event) => {
          const chosen = event.target.value;
          const first = onCommit(
            inheritLabel !== undefined && chosen === '' ? undefined : chosen,
          )[0];
          setMessage(
            first
              ? describeIssue(
                  first,
                  ctx.options.labels.editor,
                  ctx.options.locale,
                  ctx.options.labels.issues,
                )
              : null,
          );
          if (!first) markApplied();
        }}
      >
        {inheritLabel !== undefined ? <option value="">{inheritLabel}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}
