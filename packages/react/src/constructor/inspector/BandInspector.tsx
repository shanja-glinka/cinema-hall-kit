import { resolveConstraints, resolveSection, type BandConfig } from '@cinema-hall/core';
import { useHallEditorContext } from '../context.js';
import { formatLabel } from '../../labels/labels.js';
import { editorLabel } from '../../labels/editor-labels.js';
import { CheckboxField } from '../fields/CheckboxField.js';
import { balconyMinElevation, balconyPlacement } from '../editor/bands.js';
import { editorConstraints, latestConfig } from '../editor/use-hall-editor.js';
import { TextField } from '../fields/TextField.js';
import { NumberField } from '../fields/NumberField.js';
import { SelectField } from '../fields/SelectField.js';
import { isHidden, isLocked, seatTypeOptions, useActionRunner } from '../form/shared.js';
import { bandDisplayName } from '../issues-view.js';

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
  const name = bandDisplayName(band, index, L);
  // An empty gap falls back to the row spacing of the band's first section.
  const first = band.sections[0];
  const defaultGap = first ? resolveSection(band, first).rowSpacing : undefined;
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
      <TextField
        path={[...base, 'label']}
        label={formatLabel(editorLabel(L, 'bandLabel'))}
        value={band.label}
        placeholder={name}
        onCommit={(label) => editor.bands.patch(band.id, { label: label || undefined })}
      />
      <div data-chk="editor-pair">
        <NumberField
          path={[...base, 'gapBefore']}
          label={formatLabel(L.bandGapBefore)}
          unit={metres}
          value={band.gapBefore}
          optional
          placeholder={index === 0 ? undefined : defaultGap}
          hint={
            index === 0
              ? formatLabel(editorLabel(L, 'bandGapFirst'))
              : defaultGap === undefined
                ? undefined
                : formatLabel(editorLabel(L, 'bandGapHint'), { value: defaultGap })
          }
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
      <BandLevelFields band={band} index={index} />
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
            <span data-chk="editor-move-group">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={locked || index === 0}
                aria-label={formatLabel(L.moveUpNamed, { name })}
                onClick={() => run(editor.bands.move(band.id, index - 1))}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={locked || index === editor.config.layout.bands.length - 1}
                aria-label={formatLabel(L.moveDownNamed, { name })}
                onClick={() => run(editor.bands.move(band.id, index + 1))}
              >
                ↓
              </Button>
            </span>
          </>
        ) : null}
      </div>
    </>
  );
}

/**
 * The upper-level switch of a band and, while it is on, where the band starts and how high its
 * floor is. Turning it on suggests both (see `balconyPlacement`); turning it off removes them, so
 * the band follows the band in front again.
 * @param props The band and its index.
 * @param props.band The band concerned.
 * @param props.index Position of the band.
 * @returns The switch and the two fields.
 */
function BandLevelFields({ band, index }: { band: BandConfig; index: number }) {
  const { editor, options } = useHallEditorContext();
  const L = options.labels.editor;
  const base = ['layout', 'bands', index];
  const metres = formatLabel(L.unitMetres);
  const lifted = band.startDistance !== undefined || band.elevation !== undefined;
  const constraints = editorConstraints(editor);
  const fields = (
    <>
      <NumberField
        path={[...base, 'startDistance']}
        label={formatLabel(editorLabel(L, 'bandStartDistance'))}
        unit={formatLabel(editorLabel(L, 'unitFromScreen'))}
        value={band.startDistance}
        optional
        hint={formatLabel(editorLabel(L, 'bandStartDistanceHint'))}
        onCommit={(startDistance) => editor.bands.patch(band.id, { startDistance })}
      />
      <NumberField
        path={[...base, 'elevation']}
        label={formatLabel(editorLabel(L, 'bandElevation'))}
        unit={metres}
        value={band.elevation}
        optional
        hint={(() => {
          const start = band.startDistance;
          const least =
            start === undefined
              ? null
              : balconyMinElevation(editor.config, band.id, start, constraints);
          if (least === null) return undefined;
          return formatLabel(editorLabel(L, 'bandElevationHint'), {
            value: least,
            clearance: resolveConstraints(editor.config, { constraints }).minOverhangClearance,
          });
        })()}
        onCommit={(elevation) => editor.bands.patch(band.id, { elevation })}
      />
    </>
  );
  if (index === 0) {
    return (
      <>
        {lifted ? fields : null}
        <p data-chk="editor-field-hint">{formatLabel(editorLabel(L, 'bandUpperLevelFirst'))}</p>
      </>
    );
  }
  return (
    <>
      <CheckboxField
        path={[...base, 'elevation']}
        label={formatLabel(editorLabel(L, 'bandUpperLevel'))}
        checked={lifted}
        onCommit={(on) => {
          if (!on)
            return editor.bands.patch(band.id, { startDistance: undefined, elevation: undefined });
          const place = balconyPlacement(latestConfig(editor), band.id, constraints);
          return place === null ? [] : editor.bands.patch(band.id, place);
        }}
      />
      {lifted ? (
        fields
      ) : (
        <p data-chk="editor-field-hint">
          {formatLabel(editorLabel(L, 'bandUpperLevelHint'))}{' '}
          {formatLabel(editorLabel(L, 'bandPlacementHint'))}
        </p>
      )}
    </>
  );
}
