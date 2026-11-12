import { useHallEditorContext } from '../context.js';
import { formatLabel } from '../../labels/labels.js';
import type { ExtraField } from '../types.js';
import { CheckboxField } from '../fields/CheckboxField.js';
import { NumberField } from '../fields/NumberField.js';
import { SelectField } from '../fields/SelectField.js';
import { TextField } from '../fields/TextField.js';

/**
 * Host fields stored in `config.meta`. They travel with the hall and reach the manifest's source.
 * @returns The host `extraFields` stored in `config.meta`, or nothing when there are none.
 * @example <ExtraFields />
 */
export function ExtraFields() {
  const { extraFields, options } = useHallEditorContext();
  if (extraFields.length === 0) {
    return <p data-chk="editor-empty">{formatLabel(options.labels.editor.extraEmpty)}</p>;
  }
  return (
    <div data-chk="editor-grid">
      {extraFields.map((field) => (
        <ExtraControl key={field.key} field={field} />
      ))}
    </div>
  );
}

function ExtraControl({ field }: { field: ExtraField }) {
  const { editor, options } = useHallEditorContext();
  const none = formatLabel(options.labels.editor.none);
  const name = field.key.slice('meta.'.length);
  const raw = editor.config.meta?.[name];
  const setMeta = (value: unknown) => editor.patch({ meta: { [name]: value } });
  const path = ['meta', name];
  switch (field.control) {
    case 'number':
      return (
        <NumberField
          path={path}
          label={field.label}
          optional
          value={typeof raw === 'number' ? raw : undefined}
          onCommit={(value) => setMeta(value)}
        />
      );
    case 'text':
      return (
        <TextField
          path={path}
          label={field.label}
          value={typeof raw === 'string' ? raw : undefined}
          onCommit={(text) => setMeta(text === '' ? undefined : text)}
        />
      );
    case 'select':
      return (
        <SelectField
          path={path}
          label={field.label}
          value={typeof raw === 'string' ? raw : undefined}
          options={(field.options ?? []).map((value) => ({ value, label: value }))}
          inheritLabel={none}
          onCommit={(value) => setMeta(value)}
        />
      );
    case 'checkbox':
      return (
        <CheckboxField
          path={path}
          label={field.label}
          checked={raw === true}
          onCommit={(checked) => setMeta(checked)}
        />
      );
  }
}
