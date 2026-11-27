import { useHallEditorContext } from '../context.js';
import { suggestId } from '@cinema-hall/core';
import { formatLabel } from '../../labels/labels.js';
import { TextField } from '../fields/TextField.js';
import { NumberField } from '../fields/NumberField.js';
import { ColorField } from '../fields/ColorField.js';
import { isHidden, isLocked, useActionRunner } from '../form/shared.js';
import { PriceField } from './PriceField.js';
import { editorLabel } from '../../labels/editor-labels.js';

/**
 * The catalogue and base prices; the editor refuses removal of a used type. A type's short code (its
 * id) is made from its name; until the hall is saved with it, renaming the type renames the code too.
 * The code can also be edited by hand, under the type's "Advanced" part, which opens by itself when
 * the code has an issue.
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
  /** Type and tier ids in use, without `own`: a type may keep its own id. */
  const takenIds = (own?: string): Set<string> => {
    const ids = new Set([
      ...Object.keys(editor.config.seatTypes),
      ...Object.keys(editor.config.pricing?.tiers ?? {}),
    ]);
    if (own !== undefined) ids.delete(own);
    return ids;
  };
  /** Seat types whose code itself has an issue: their "Advanced" part opens. */
  const codeIssues = new Set(
    editor.issues
      .filter(
        (issue) =>
          issue.path.length === 2 &&
          issue.path[0] === 'seatTypes' &&
          typeof issue.path[1] === 'string',
      )
      .map((issue) => String(issue.path[1])),
  );
  // A host's own editor may not offer renaming (it is optional): ids then stay as they are.
  const rename = editor.seatTypes.rename?.bind(editor.seatTypes);
  const relabel = (id: string, label: string) => {
    // A type the saved hall does not have yet follows its name; a saved type keeps its id, because
    // the host's prices and bookings may refer to it.
    if (rename === undefined || Object.hasOwn(editor.baseline.seatTypes, id))
      return editor.seatTypes.patch(id, { label });
    return editor.batch(() => {
      if (editor.seatTypes.patch(id, { label }).length > 0) return;
      const next = suggestId(label, takenIds(id), 'type');
      if (next !== id) rename(id, next);
    });
  };
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
                  onCommit={(label) => relabel(id, label)}
                />
                <ColorField
                  path={['seatTypes', id, 'color']}
                  label={formatLabel(L.seatTypeColor)}
                  value={type.color}
                  onCommit={(color) => editor.seatTypes.patch(id, { color })}
                />
                {/* The code is for files and price lists: out of the way unless it has a problem. */}
                <details
                  data-chk="editor-advanced"
                  data-seat-type-code={id}
                  open={codeIssues.has(id) || undefined}
                >
                  <summary>{formatLabel(L.advanced)}</summary>
                  <div data-chk="editor-secondary">
                    {rename !== undefined ? (
                      <TextField
                        path={['seatTypes', id]}
                        label={formatLabel(L.seatTypeId)}
                        value={id}
                        hint={formatLabel(editorLabel(L, 'seatTypeIdHint'))}
                        onCommit={(next) => (next === id ? [] : rename(id, next))}
                      />
                    ) : (
                      <p data-chk="editor-seat-type-code">
                        {formatLabel(L.seatTypeId)}: <code>{id}</code>
                      </p>
                    )}
                  </div>
                </details>
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
              {!hidden ? (
                <td data-chk="editor-type-actions">
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
                </td>
              ) : null}
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
            const label = formatLabel(L.newSeatType);
            const id = suggestId(label, takenIds(), 'type');
            run(
              editor.seatTypes.add(id, {
                label,
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
