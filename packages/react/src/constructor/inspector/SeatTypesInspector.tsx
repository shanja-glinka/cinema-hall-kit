import { useHallEditorContext } from '../context.js';
import { uniqueId } from '../editor/config.js';
import { formatLabel } from '../../labels/labels.js';
import { TextField } from '../fields/TextField.js';
import { NumberField } from '../fields/NumberField.js';
import { ColorField } from '../fields/ColorField.js';
import { isHidden, isLocked, useActionRunner } from '../form/shared.js';
import { PriceField } from './PriceField.js';

/**
 * The catalogue and base prices; the editor refuses removal of a used type.
 * @returns The control or panel inside HallConstructorRoot.
 * @example <SeatTypesInspector />
 */
export function SeatTypesInspector() {
  const { editor, options, readOnly, notify } = useHallEditorContext();
  const L = options.labels.editor;
  const { Button } = options.slots;
  const { run } = useActionRunner();
  const hidden = isHidden(editor, 'structure.seatTypes');
  const locked = isLocked(editor, 'structure.seatTypes', readOnly);
  return (
    <>
      <table data-chk="editor-types-table">
        <thead>
          <tr>
            <th>{formatLabel(L.name)}</th>
            <th>{formatLabel(L.hallWidth)}</th>
            <th>{formatLabel(L.hallDepth)}</th>
            <th>{formatLabel(L.seatPrice)}</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(editor.config.seatTypes).map(([id, type]) => (
            <tr key={id} data-seat-type={id} data-chk-id={`seatType:${id}`} tabIndex={-1}>
              <td>
                <TextField
                  path={['seatTypes', id, 'label']}
                  label={formatLabel(L.seatTypeLabel)}
                  value={type.label}
                  onCommit={(label) => editor.seatTypes.patch(id, { label })}
                />
                <ColorField
                  path={['seatTypes', id, 'color']}
                  label={formatLabel(L.seatTypeColor)}
                  value={type.color}
                  onCommit={(color) => editor.seatTypes.patch(id, { color })}
                />
                {!hidden ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={locked}
                    aria-label={formatLabel(L.removeNamed, { name: type.label })}
                    onClick={() => {
                      const issues = editor.seatTypes.remove(id);
                      if (issues.some((issue) => issue.code === 'schema.unknownSeatType'))
                        notify(formatLabel(L.unavailableType));
                      else run(issues);
                    }}
                  >
                    {formatLabel(L.remove)}
                  </Button>
                ) : null}
              </td>
              <td>
                <NumberField
                  path={['seatTypes', id, 'width']}
                  label={formatLabel(L.seatTypeWidth)}
                  value={type.width}
                  unit={formatLabel(L.unitMetres)}
                  step={0.01}
                  onCommit={(width) => editor.seatTypes.patch(id, { width })}
                />
              </td>
              <td>
                <NumberField
                  path={['seatTypes', id, 'depth']}
                  label={formatLabel(L.seatTypeDepth)}
                  value={type.depth}
                  unit={formatLabel(L.unitMetres)}
                  step={0.01}
                  onCommit={(depth) => editor.seatTypes.patch(id, { depth })}
                />
              </td>
              <td>
                <PriceField tier={id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!hidden ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={locked}
          onClick={() => {
            const id = uniqueId('type', new Set(Object.keys(editor.config.seatTypes)));
            run(
              editor.seatTypes.add(id, {
                label: formatLabel(L.newSeatType),
                width: 0.55,
                depth: 0.6,
                color: '#5E636B',
              }),
              ['seatTypes', id, 'label'],
            );
          }}
        >
          {formatLabel(L.seatTypeAdd)}
        </Button>
      ) : null}
    </>
  );
}
