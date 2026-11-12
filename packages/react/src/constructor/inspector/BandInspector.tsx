import type { BandConfig } from '@cinema-hall/core';
import { useHallEditorContext } from '../context.js';
import { formatLabel } from '../../labels/labels.js';
import { TextField } from '../fields/TextField.js';
import { NumberField } from '../fields/NumberField.js';
import { SelectField } from '../fields/SelectField.js';
import { isHidden, isLocked, seatTypeOptions, useActionRunner } from '../form/shared.js';

/**
 * Band geometry, defaults and actions without section forms.
 * @param props Selected band and its current index.
 * @param props.band The band concerned.
 * @param props.index Position of the item.
 * @returns The control or panel inside HallConstructorRoot.
 * @example <BandInspector band={band} index={0} />
 */
export function BandInspector({ band, index }: { band: BandConfig; index: number }) {
  const { editor, options, readOnly, selection } = useHallEditorContext();
  const L = options.labels.editor;
  const { Button } = options.slots;
  const { run } = useActionRunner();
  const base = ['layout', 'bands', index];
  const locked = isLocked(editor, 'structure.bands', readOnly);
  const metres = formatLabel(L.unitMetres);
  return (
    <>
      <TextField
        path={[...base, 'id']}
        label={formatLabel(L.sectionId)}
        value={band.id}
        onCommit={(id) => {
          const issues = editor.bands.patch(band.id, { id });
          if (!issues.length) selection.select({ kind: 'band', bandId: id });
          return issues;
        }}
      />
      <div data-chk="editor-pair">
        <NumberField
          path={[...base, 'gapBefore']}
          label={formatLabel(L.bandGapBefore)}
          unit={metres}
          value={band.gapBefore}
          optional
          onCommit={(gapBefore) => editor.bands.patch(band.id, { gapBefore })}
        />
        <NumberField
          path={[...base, 'riserHeight']}
          label={formatLabel(L.bandRiser)}
          unit={metres}
          value={band.riserHeight}
          optional
          onCommit={(riserHeight) => editor.bands.patch(band.id, { riserHeight })}
        />
      </div>
      <h3 data-chk="editor-subtitle">{formatLabel(L.bandDefaults)}</h3>
      <div data-chk="editor-pair">
        <NumberField
          path={[...base, 'defaults', 'rows']}
          label={formatLabel(L.sectionRows)}
          integer
          optional
          value={band.defaults?.rows}
          onCommit={(rows) => editor.bands.patch(band.id, { defaults: { rows } })}
        />
        <NumberField
          path={[...base, 'defaults', 'rowSpacing']}
          label={formatLabel(L.sectionRowSpacing)}
          unit={metres}
          optional
          value={band.defaults?.rowSpacing}
          onCommit={(rowSpacing) => editor.bands.patch(band.id, { defaults: { rowSpacing } })}
        />
      </div>
      <NumberField
        path={[...base, 'defaults', 'seatPitch']}
        label={formatLabel(L.sectionSeatPitch)}
        unit={metres}
        optional
        value={band.defaults?.seatPitch}
        onCommit={(seatPitch) => editor.bands.patch(band.id, { defaults: { seatPitch } })}
      />
      <SelectField
        path={[...base, 'defaults', 'seatType']}
        label={formatLabel(L.sectionSeatType)}
        value={band.defaults?.seatType}
        options={seatTypeOptions(editor.config)}
        inheritLabel={formatLabel(L.none)}
        onCommit={(seatType) => editor.bands.patch(band.id, { defaults: { seatType } })}
      />
      <div data-chk="editor-actions">
        {!isHidden(editor, 'structure.sections') ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isLocked(editor, 'structure.sections', readOnly)}
            onClick={() =>
              run(editor.sections.add(band.id), [
                ...base,
                'sections',
                band.sections.length,
                'seatsPerRow',
              ])
            }
          >
            {formatLabel(L.sectionAdd)}
          </Button>
        ) : null}
        {!isHidden(editor, 'structure.bands') ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={locked || editor.config.layout.bands.length <= 1}
              onClick={() => {
                const issues = editor.bands.remove(band.id);
                run(issues);
                if (!issues.length) selection.clear();
              }}
            >
              {formatLabel(L.removeBand)}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={locked || index === 0}
              aria-label={formatLabel(L.moveUpNamed, { name: band.id })}
              onClick={() => run(editor.bands.move(band.id, index - 1))}
            >
              ↑
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={locked || index === editor.config.layout.bands.length - 1}
              aria-label={formatLabel(L.moveDownNamed, { name: band.id })}
              onClick={() => run(editor.bands.move(band.id, index + 1))}
            >
              ↓
            </Button>
          </>
        ) : null}
      </div>
    </>
  );
}
