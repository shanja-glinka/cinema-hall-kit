import { DEFAULT_VIEWING_ZONES, pathToString, type ViewingZone } from '@cinema-hall/core';
import { uniqueId } from '../editor/config.js';
import { useHallEditorContext } from '../context.js';
import { formatLabel } from '../../labels/labels.js';
import { NumberField } from '../fields/NumberField.js';
import { TextField } from '../fields/TextField.js';
import { ActionNote, isHidden, isLocked, RowControls, useActionRunner } from './shared.js';

/**
 * Viewing zones, ordered from the closest to the furthest. The list is replaced whole on each edit.
 * @returns The viewing-zone list with add, move and remove controls.
 * @example <ZonesFields />
 */
export function ZonesFields() {
  const ctx = useHallEditorContext();
  const { editor, options, readOnly } = ctx;
  const L = options.labels.editor;
  const { Button } = options.slots;
  const { announcement, run } = useActionRunner();
  const zones: readonly ViewingZone[] = editor.config.viewingZones ?? DEFAULT_VIEWING_ZONES;
  const locked = isLocked(editor, 'viewingZones', readOnly);
  const hidden = isHidden(editor, 'viewingZones');

  const setZones = (next: ViewingZone[]) => editor.patch({ viewingZones: next });

  // A hidden group is not offered at all: no rows, no row controls and no add button.
  if (hidden) return null;

  return (
    <div tabIndex={-1} data-chk-path={pathToString(['viewingZones'])}>
      {zones.map((zone, index) => (
        <div
          key={zone.id}
          data-chk="editor-row"
          data-zone={zone.id}
          tabIndex={-1}
          data-chk-path={pathToString(['viewingZones', index])}
        >
          <RowControls
            name={zone.label}
            index={index}
            count={zones.length}
            locked={locked}
            onMove={(to) => {
              const next = [...zones];
              const [moved] = next.splice(index, 1);
              if (moved) next.splice(to, 0, moved);
              run(
                setZones(next),
                ['viewingZones', to],
                formatLabel(L.movedTo, { name: zone.label, position: to + 1, total: zones.length }),
              );
            }}
            onDuplicate={() => {
              const id = uniqueId(`${zone.id}-copy`, new Set(zones.map((item) => item.id)));
              const next = [...zones];
              next.splice(index + 1, 0, { ...zone, id });
              run(setZones(next), ['viewingZones', index + 1]);
            }}
            onRemove={() =>
              run(setZones(zones.filter((_, position) => position !== index)), [
                'viewingZones',
                Math.max(0, index - 1),
              ])
            }
          />
          <div data-chk="editor-grid">
            <TextField
              path={['viewingZones', index, 'label']}
              label={formatLabel(L.zoneLabel)}
              value={zone.label}
              onCommit={(label) =>
                setZones(
                  zones.map((item, position) => (position === index ? { ...item, label } : item)),
                )
              }
            />
            <NumberField
              path={['viewingZones', index, 'minFov']}
              label={formatLabel(L.zoneMinFov)}
              unit={formatLabel(L.unitDegrees)}
              integer
              value={zone.minFov}
              onCommit={(minFov) =>
                setZones(
                  zones.map((item, position) =>
                    position === index ? { ...item, minFov: minFov ?? item.minFov } : item,
                  ),
                )
              }
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={locked}
        onClick={() => {
          const id = uniqueId('zone', new Set(zones.map((zone) => zone.id)));
          run(setZones([...zones, { id, label: formatLabel(L.newZone), minFov: 0 }]), [
            'viewingZones',
            zones.length,
            'label',
          ]);
        }}
      >
        {formatLabel(L.zoneAdd)}
      </Button>
      <ActionNote announcement={announcement} />
    </div>
  );
}
