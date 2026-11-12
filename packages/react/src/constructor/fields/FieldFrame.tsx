import type { ReactNode } from 'react';
import type { FieldState } from './use-field.js';

/**
 * Props of the field frame: field state, label, optional unit and the control.
 */
export interface FieldFrameProps {
  field: FieldState;
  label: string;
  unit?: string;
  children: ReactNode;
}

/**
 * Label, control, unit and message of one field. Renders nothing for hidden fields.
 * @param props Field state, label, unit and the control to frame.
 * @param props.field Field state from `useField`.
 * @param props.label Visible label of the control.
 * @param props.unit Unit text shown after the control.
 * @param props.children The control to frame.
 * @returns The framed field, or nothing when hidden.
 * @example <FieldFrame field={field} label="Width"><input id={field.id} /></FieldFrame>
 */
export function FieldFrame({ field, label, unit, children }: FieldFrameProps) {
  if (field.hidden) return null;
  return (
    <div data-chk="editor-field" data-access={field.access} data-path={field.path}>
      <label htmlFor={field.id} data-chk="editor-label">
        {label}
      </label>
      <div data-chk="editor-control">
        {children}
        {unit ? <span data-chk="editor-unit">{unit}</span> : null}
      </div>
      {field.text ? (
        <p id={field.messageId} data-chk="editor-message" data-invalid={field.invalid || undefined}>
          {field.text}
        </p>
      ) : null}
    </div>
  );
}
