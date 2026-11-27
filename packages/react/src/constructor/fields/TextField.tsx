import type { KeyboardEvent } from 'react';
import type { Issue } from '@cinema-hall/core';
import { useHallEditorContext } from '../context.js';
import { describeIssue } from '../issues-view.js';
import { FieldFrame } from './FieldFrame.js';
import { useField, type FieldPath } from './use-field.js';
import { useScopedState } from './scoped-state.js';
import { useAppliedFlash } from './applied.js';

/**
 * Props of a text field bound to a config path.
 */
export interface TextFieldProps {
  path: FieldPath;
  label: string;
  value: string | undefined;
  /** Receives the trimmed text on blur or Enter. Returns the rejections (empty = applied). */
  onCommit: (text: string) => Issue[];
  placeholder?: string;
  /** Muted help under the field. */
  hint?: string;
  /**
   * Default true: a committed change shows "Changed — not saved yet" above the field. The toolbar's
   * name field turns it off: its own "Unsaved changes" state says it, and a note there would push
   * the toolbar buttons down under the pointer.
   */
  showApplied?: boolean;
}

/**
 * A text input that keeps a draft and commits on blur or Enter.
 * @param props Path, label, value, placeholder and commit handler.
 * @param props.path Config path the control edits.
 * @param props.label Visible label of the control.
 * @param props.value Current value, or undefined when unset.
 * @param props.onCommit Receives the new value and returns the rejecting issues (empty = applied).
 * @param props.placeholder Text shown while the field is empty.
 * @param props.hint Muted help under the field.
 * @param props.showApplied Whether a committed change shows the "not saved yet" note.
 * @returns The labelled input, or nothing when hidden.
 * @example <TextField path={["name"]} label="Name" value="Hall" onCommit={rename} />
 */
export function TextField({
  path,
  label,
  value,
  onCommit,
  placeholder,
  hint,
  showApplied = true,
}: TextFieldProps) {
  const ctx = useHallEditorContext();
  const [draft, setDraft] = useScopedState<string | null>(ctx.editor.generation, null);
  const [message, setMessage] = useScopedState<string | null>(ctx.editor.generation, null);
  const field = useField(path, message);
  const [applied, markApplied] = useAppliedFlash();

  const commit = (): void => {
    if (draft === null) return;
    const text = draft.trim();
    const first = onCommit(text)[0];
    if (first) {
      setMessage(
        describeIssue(
          first,
          ctx.options.labels.editor,
          ctx.options.locale,
          ctx.options.labels.issues,
        ),
      );
      return;
    }
    if (text !== (value ?? '')) markApplied();
    setDraft(null);
    setMessage(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
  };

  if (field.hidden) return null;
  return (
    <FieldFrame field={field} label={label} hint={hint} applied={showApplied && applied}>
      <input
        id={field.id}
        type="text"
        autoComplete="off"
        data-chk="editor-input"
        data-chk-path={field.path}
        value={draft ?? value ?? ''}
        placeholder={placeholder}
        aria-invalid={field.invalid || undefined}
        aria-describedby={field.describedBy}
        disabled={field.disabled}
        onChange={(event) => {
          setDraft(event.target.value);
          setMessage(null);
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
    </FieldFrame>
  );
}
