import type { Issue } from '@cinema-hall/core';
import { useHallEditorContext } from '../context.js';
import { describeIssue } from '../issues-view.js';
import { formatLabel } from '../../labels/labels.js';
import { FieldFrame } from './FieldFrame.js';
import { useField, type FieldPath } from './use-field.js';
import { useScopedState } from './scoped-state.js';
import { useAppliedFlash } from './applied.js';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Props of a colour field bound to a config path.
 */
export interface ColorFieldProps {
  path: FieldPath;
  label: string;
  value: string | undefined;
  /** Receives `#RRGGBB` (upper case) or `undefined` when the optional colour is cleared. */
  onCommit: (value: string | undefined) => Issue[];
  optional?: boolean;
}

/**
 * A `#RRGGBB` text input with a native colour swatch next to it. Colours are stored in upper case.
 * @param props Path, label, colour, commit handler and optional flag.
 * @param props.path Config path the control edits.
 * @param props.label Visible label of the control.
 * @param props.value Current value, or undefined when unset.
 * @param props.onCommit Receives the new value and returns the rejecting issues (empty = applied).
 * @param props.optional Whether an empty value clears the field.
 * @returns The labelled field, or nothing when hidden.
 * @example <ColorField path={["hall", "wallColor"]} label="Walls" value="#101010" onCommit={set} />
 */
export function ColorField({ path, label, value, onCommit, optional = false }: ColorFieldProps) {
  const ctx = useHallEditorContext();
  const labels = ctx.options.labels.editor;
  const [draft, setDraft] = useScopedState<string | null>(ctx.editor.generation, null);
  const [message, setMessage] = useScopedState<string | null>(ctx.editor.generation, null);
  const field = useField(path, message);
  const [applied, markApplied] = useAppliedFlash();
  const swatch = value !== undefined && HEX_COLOR.test(value) ? value.toLowerCase() : '#000000';

  const submit = (candidate: string | undefined): void => {
    const first = onCommit(candidate)[0];
    if (first) {
      setMessage(describeIssue(first, labels, ctx.options.locale, ctx.options.labels.issues));
      return;
    }
    if (candidate !== value) markApplied();
    setDraft(null);
    setMessage(null);
  };

  const commitDraft = (): void => {
    if (draft === null) return;
    const text = draft.trim();
    if (text === '' && optional) submit(undefined);
    else if (HEX_COLOR.test(text)) submit(text.toUpperCase());
    else setMessage(formatLabel(labels.fieldHex));
  };

  if (field.hidden) return null;
  return (
    <FieldFrame field={field} label={label} applied={applied}>
      <input
        id={field.id}
        type="text"
        autoComplete="off"
        data-chk="editor-input"
        data-chk-path={field.path}
        value={draft ?? value ?? ''}
        placeholder={optional ? '#RRGGBB' : undefined}
        aria-invalid={field.invalid || undefined}
        aria-describedby={field.describedBy}
        disabled={field.disabled}
        onChange={(event) => {
          setDraft(event.target.value);
          setMessage(null);
        }}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitDraft();
          }
        }}
      />
      <input
        type="color"
        data-chk="editor-swatch"
        aria-label={formatLabel(labels.colorPicker)}
        value={swatch}
        disabled={field.disabled}
        onChange={(event) => submit(event.target.value.toUpperCase())}
      />
    </FieldFrame>
  );
}
