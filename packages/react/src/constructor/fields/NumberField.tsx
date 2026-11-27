import type { KeyboardEvent } from 'react';
import { fieldKeyForPath, type Issue } from '@cinema-hall/core';
import { useHallEditorContext } from '../context.js';
import { describeIssue } from '../issues-view.js';
import { formatLabel } from '../../labels/labels.js';
import { FieldFrame } from './FieldFrame.js';
import { parseNumberDraft, roundStep } from './draft.js';
import { useField, type FieldPath } from './use-field.js';
import { useScopedState } from './scoped-state.js';
import { useAppliedFlash } from './applied.js';

/** Draft number field path, value, commit handler and optional bounds. */
export interface NumberFieldProps {
  path: FieldPath;
  label: string;
  /** The committed value; `undefined` when the field is empty or inherits a band value. */
  value: number | undefined;
  /** Applies the value. Returns the rejections; an empty array means it was applied. */
  onCommit: (value: number | undefined) => Issue[];
  unit?: string;
  /** Empty input is allowed and means "unset". */
  optional?: boolean;
  integer?: boolean;
  /** Shown in the input when empty: the inherited or library value. */
  placeholder?: number;
  /** Default step for the arrow keys. */
  step?: number;
  /** Default minimum, overridden by fieldLimits. */
  min?: number;
  /** Default maximum, overridden by fieldLimits. */
  max?: number;
  /** Shows a reset button under the field when a value is set (for inherited values). */
  onReset?: () => void;
  resetLabel?: string;
  /** Muted help under the field (for example where an empty value comes from). */
  hint?: string;
}

/**
 * A number draft committed on blur, Enter or arrow keys. Invalid drafts never change the config.
 * @param props Path, value, commit handler, limits and inherited value.
 * @returns The control or panel inside HallConstructorRoot.
 * @example <NumberField path={["hall", "width"]} label="Width" value={14} onCommit={setWidth} />
 */
export function NumberField(props: NumberFieldProps) {
  const { path, label, value, onCommit, unit, optional = false, integer = false } = props;
  const { placeholder, step, onReset, resetLabel, hint } = props;
  const ctx = useHallEditorContext();
  const labels = ctx.options.labels.editor;
  const { Button } = ctx.options.slots;
  const key = fieldKeyForPath(path);
  const limit = key === null ? undefined : ctx.fieldLimits[key];
  const min = limit?.min ?? props.min;
  const max = limit?.max ?? props.max;
  const stepSize = limit?.step ?? step ?? (integer ? 1 : 0.05);
  const [draft, setDraft] = useScopedState<string | null>(ctx.editor.generation, null);
  const [message, setMessage] = useScopedState<string | null>(ctx.editor.generation, null);
  const field = useField(path, message);
  const [applied, markApplied] = useAppliedFlash();

  const rangeError = (candidate: number): string | null => {
    if (min !== undefined && max !== undefined && (candidate < min || candidate > max)) {
      return formatLabel(labels.fieldRange, { min, max });
    }
    if (min !== undefined && candidate < min) return formatLabel(labels.fieldMin, { min });
    if (max !== undefined && candidate > max) return formatLabel(labels.fieldMax, { max });
    return null;
  };

  const submit = (candidate: number | undefined): void => {
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
    const parsed = parseNumberDraft(draft, integer);
    if (parsed.kind === 'invalid') {
      setMessage(formatLabel(integer ? labels.fieldInteger : labels.fieldNumber));
      return;
    }
    if (parsed.kind === 'empty') {
      if (!optional) setMessage(formatLabel(labels.fieldNumber));
      else submit(undefined);
      return;
    }
    const outOfRange = rangeError(parsed.value);
    if (outOfRange) {
      setMessage(outOfRange);
      return;
    }
    submit(parsed.value);
  };

  const stepBy = (direction: 1 | -1): void => {
    // A valid draft is what the user sees, so the step starts from it, not from the committed value.
    const typed = draft === null ? null : parseNumberDraft(draft, integer);
    const base = typed?.kind === 'number' ? typed.value : (value ?? placeholder ?? 0);
    const next = roundStep(base + direction * stepSize);
    if (rangeError(next) !== null) return;
    submit(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitDraft();
    } else if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !field.disabled) {
      event.preventDefault();
      stepBy(event.key === 'ArrowUp' ? 1 : -1);
    }
  };

  if (field.hidden) return null;
  const shown = draft ?? (value === undefined ? '' : String(value));
  return (
    <FieldFrame
      field={field}
      label={label}
      unit={unit}
      hint={hint}
      applied={applied}
      after={
        onReset && value !== undefined && !field.disabled ? (
          <div data-chk="editor-field-actions">
            <Button type="button" variant="ghost" size="sm" onClick={onReset}>
              {resetLabel}
            </Button>
          </div>
        ) : null
      }
    >
      <input
        id={field.id}
        type="text"
        inputMode={integer ? 'numeric' : 'decimal'}
        autoComplete="off"
        data-chk="editor-input"
        data-chk-path={field.path}
        value={shown}
        placeholder={placeholder === undefined ? undefined : String(placeholder)}
        aria-invalid={field.invalid || undefined}
        aria-describedby={field.describedBy}
        disabled={field.disabled}
        onChange={(event) => {
          setDraft(event.target.value);
          setMessage(null);
        }}
        onBlur={commitDraft}
        onKeyDown={onKeyDown}
      />
    </FieldFrame>
  );
}
