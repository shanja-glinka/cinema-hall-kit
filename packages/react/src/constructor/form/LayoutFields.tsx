import { DEFAULT_EYE_HEIGHT } from '@cinema-hall/core';
import { useHallEditorContext } from '../context.js';
import { formatLabel } from '../../labels/labels.js';
import { NumberField } from '../fields/NumberField.js';
import { SelectField } from '../fields/SelectField.js';

/**
 * Advanced hall layout: row labels, seat numbering and eye height.
 * @returns The control or panel inside HallConstructorRoot.
 * @example <LayoutFields />
 */
export function LayoutFields() {
  const { editor, options } = useHallEditorContext();
  const L = options.labels.editor;
  const { layout } = editor.config;
  const rowLabels = layout.rowLabels;
  const rowLabelsValue = Array.isArray(rowLabels) ? 'custom' : (rowLabels ?? 'alphabetic');
  return (
    <div data-chk="editor-grid">
      <SelectField
        path={['layout', 'rowLabels']}
        label={formatLabel(L.rowLabels)}
        value={rowLabelsValue}
        options={[
          { value: 'alphabetic', label: formatLabel(L.rowLabelsAlphabetic) },
          { value: 'numeric', label: formatLabel(L.rowLabelsNumeric) },
          { value: 'custom', label: formatLabel(L.rowLabelsCustom), disabled: true },
        ]}
        onCommit={(value) =>
          value === 'alphabetic' || value === 'numeric'
            ? editor.patch({ layout: { rowLabels: value } })
            : []
        }
      />
      <SelectField
        path={['layout', 'seatNumbering']}
        label={formatLabel(L.seatNumbering)}
        value={layout.seatNumbering ?? 'continuous'}
        options={[
          { value: 'continuous', label: formatLabel(L.numberingContinuous) },
          { value: 'perSection', label: formatLabel(L.numberingPerSection) },
        ]}
        onCommit={(value) =>
          value === 'continuous' || value === 'perSection'
            ? editor.patch({ layout: { seatNumbering: value } })
            : []
        }
      />
      <NumberField
        path={['layout', 'eyeHeight']}
        label={formatLabel(L.eyeHeight)}
        unit={formatLabel(L.unitMetres)}
        value={layout.eyeHeight}
        optional
        placeholder={DEFAULT_EYE_HEIGHT}
        onCommit={(eyeHeight) => editor.patch({ layout: { eyeHeight } })}
      />
    </div>
  );
}
