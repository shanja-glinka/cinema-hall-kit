import type { ReactNode } from 'react';
import { formatLabel } from '../../labels/labels.js';
import { useHallEditorContext } from '../context.js';
import { IssueFixButton } from '../ui/IssueFixButton.js';
import type { FieldState } from './use-field.js';
import { editorLabel } from '../../labels/editor-labels.js';

/**
 * Props of the field frame: field state, label, optional unit and the control.
 */
export interface FieldFrameProps {
  field: FieldState;
  label: string;
  unit?: string;
  /** Muted help under the control, shown while there is no message. */
  hint?: ReactNode;
  /** Controls under the control and its message (for example "Use the band value"). */
  after?: ReactNode;
  /** The value was just applied: the frame shows a short confirmation. */
  applied?: boolean;
  children: ReactNode;
}

/**
 * Label, control, unit and message of one field. Renders nothing for hidden fields. A field whose
 * problem has a one-click fix (a hall too small for its seats) shows the fix under the message.
 * @param props Field state, label, unit, hint and the control to frame.
 * @param props.field Field state from `useField`.
 * @param props.label Visible label of the control.
 * @param props.unit Unit text shown after the control.
 * @param props.hint Muted help under the control.
 * @param props.after Controls shown under the control and its message.
 * @param props.applied Whether to show that the value was just applied.
 * @param props.children The control to frame.
 * @returns The framed field, or nothing when hidden.
 * @example <FieldFrame field={field} label="Width"><input id={field.id} /></FieldFrame>
 */
export function FieldFrame({
  field,
  label,
  unit,
  hint,
  after,
  applied,
  children,
}: FieldFrameProps) {
  const { options } = useHallEditorContext();
  if (field.hidden) return null;
  return (
    <div
      data-chk="editor-field"
      data-access={field.access}
      data-path={field.path}
      data-applied={applied || undefined}
    >
      <div data-chk="editor-label-row">
        <label htmlFor={field.id} data-chk="editor-label">
          {label}
        </label>
        {applied ? (
          <span data-chk="editor-applied" aria-hidden="true">
            {formatLabel(editorLabel(options.labels.editor, 'applied'))}
          </span>
        ) : null}
      </div>
      <div data-chk="editor-control">
        {children}
        {unit ? <span data-chk="editor-unit">{unit}</span> : null}
      </div>
      {field.text ? (
        <p id={field.messageId} data-chk="editor-message" data-invalid={field.invalid || undefined}>
          {field.text}
        </p>
      ) : hint ? (
        <p data-chk="editor-field-hint">{hint}</p>
      ) : null}
      {field.issue ? <IssueFixButton issue={field.issue} /> : null}
      {after}
    </div>
  );
}
