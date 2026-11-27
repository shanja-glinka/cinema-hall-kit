import type { BandConfig, SectionConfig } from '@cinema-hall/core';
import { resolveSection } from '@cinema-hall/core';
import { useHallEditorContext } from '../context.js';
import { formatLabel } from '../../labels/labels.js';
import { TextField } from '../fields/TextField.js';
import { NumberField } from '../fields/NumberField.js';
import { SelectField } from '../fields/SelectField.js';
import { ColorField } from '../fields/ColorField.js';
import { useField } from '../fields/use-field.js';
import { isHidden, isLocked, removeSectionOrBand, useActionRunner } from '../form/shared.js';
import { PriceField } from './PriceField.js';
import { objectName } from '../ui/names.js';
import { editorLabel } from '../../labels/editor-labels.js';

/**
 * Fields and actions for a section, inheriting its band defaults.
 * @param props Selected section, its band and their current indices.
 * @param props.band The band concerned.
 * @param props.section The selected section.
 * @param props.bandIndex Index of the band.
 * @param props.index Position of the item.
 * @returns The control or panel inside HallConstructorRoot.
 * @example <SectionInspector band={band} section={section} bandIndex={0} index={1} />
 */
export function SectionInspector({
  band,
  section,
  bandIndex,
  index,
}: {
  band: BandConfig;
  section: SectionConfig;
  bandIndex: number;
  index: number;
}) {
  const { editor, options, readOnly, selection, exclusion, setExclusion, setView } =
    useHallEditorContext();
  const L = options.labels.editor;
  const { Button } = options.slots;
  const { run } = useActionRunner();
  const ref = { bandId: band.id, sectionId: section.id };
  const base = ['layout', 'bands', bandIndex, 'sections', index];
  const resolved = resolveSection(band, section);
  const exclude = useField([...base, 'exclude']);
  const locked = isLocked(editor, 'structure.sections', readOnly);
  const soleSection = band.sections.length === 1;
  const hidden = isHidden(editor, 'structure.sections');
  const patch = editor.sections.patch;
  const seatOptions = Object.entries(editor.config.seatTypes).map(([id, def]) => {
    const tiers = editor.config.pricing?.tiers;
    const price = tiers && Object.hasOwn(tiers, id) ? tiers[id] : undefined;
    return {
      value: id,
      label: `${def.label}${price === undefined ? '' : ` · ${options.formatPrice(price)}`}`,
    };
  });
  const shared =
    editor.config.layout.bands
      .flatMap((b) => b.sections.map((s) => resolveSection(b, s).priceTier))
      .filter((tier) => tier === resolved.priceTier).length > 1;
  // A field the section does not set shows the band value, says where it comes from and how to
  // change it; a field it sets offers to go back to the band value.
  const inherit = (key: 'rows' | 'rowSpacing' | 'seatPitch') => {
    const fromBand = resolveSection(band, { ...section, [key]: undefined })[key];
    return {
      placeholder: fromBand,
      hint:
        section[key] === undefined
          ? formatLabel(editorLabel(L, 'fromBand'), { value: fromBand })
          : undefined,
      onReset: () => run(patch(ref, { [key]: undefined })),
      resetLabel: formatLabel(editorLabel(L, 'resetToBandValue'), { value: fromBand }),
    };
  };
  return (
    <>
      <TextField
        path={[...base, 'id']}
        label={formatLabel(L.sectionId)}
        value={section.id}
        onCommit={(id) => {
          const issues = patch(ref, { id });
          if (issues.length === 0)
            selection.select({ kind: 'section', bandId: band.id, sectionId: id });
          return issues;
        }}
      />
      <div data-chk="editor-pair">
        <NumberField
          path={[...base, 'rows']}
          label={formatLabel(L.sectionRows)}
          integer
          optional
          value={section.rows}
          {...inherit('rows')}
          onCommit={(rows) => patch(ref, { rows })}
        />
        <NumberField
          path={[...base, 'seatsPerRow']}
          label={formatLabel(L.sectionSeats)}
          integer
          value={section.seatsPerRow}
          onCommit={(seatsPerRow) => patch(ref, { seatsPerRow })}
        />
      </div>
      <div data-chk="editor-type-select">
        <SelectField
          path={[...base, 'seatType']}
          label={formatLabel(L.sectionSeatType)}
          value={section.seatType}
          options={seatOptions}
          inheritLabel={formatLabel(L.inheritedValue, {
            value:
              seatOptions
                .find((t) => t.value === band.defaults?.seatType)
                ?.label.replace(' · ', ', ') ?? formatLabel(L.none),
          })}
          onCommit={(seatType) => patch(ref, { seatType })}
        />
        {!isHidden(editor, 'section.seatType') ? (
          <span
            data-chk="editor-swatch"
            style={{ background: editor.layout.seatTypes[resolved.seatType]?.color }}
          />
        ) : null}
        <button
          type="button"
          data-chk="editor-link"
          onClick={() => selection.select({ kind: 'seatTypes' })}
        >
          {formatLabel(L.editTypes)}
        </button>
      </div>
      <PriceField tier={resolved.priceTier} />
      {shared && editor.policy.pricing !== 'hidden' ? (
        <p data-chk="editor-muted">
          {formatLabel(L.sharedPrice, {
            name:
              editor.config.seatTypes[resolved.priceTier]?.label ??
              objectName(resolved.priceTier, L),
          })}
        </p>
      ) : null}
      <div data-chk="editor-pair">
        <NumberField
          path={[...base, 'rowSpacing']}
          label={formatLabel(L.sectionRowSpacing)}
          unit={formatLabel(L.unitMetres)}
          optional
          value={section.rowSpacing}
          {...inherit('rowSpacing')}
          onCommit={(rowSpacing) => patch(ref, { rowSpacing })}
        />
        <NumberField
          path={[...base, 'seatPitch']}
          label={formatLabel(L.sectionSeatPitch)}
          unit={formatLabel(L.unitMetres)}
          optional
          value={section.seatPitch}
          {...inherit('seatPitch')}
          onCommit={(seatPitch) => patch(ref, { seatPitch })}
        />
      </div>
      {index > 0 ? (
        <NumberField
          path={[...base, 'gapBefore']}
          label={formatLabel(L.sectionGap)}
          unit={formatLabel(L.unitMetres)}
          optional
          value={section.gapBefore}
          placeholder={0}
          hint={section.gapBefore ? undefined : formatLabel(editorLabel(L, 'sectionGapHint'))}
          onCommit={(gapBefore) => patch(ref, { gapBefore })}
        />
      ) : null}
      {!hidden && soleSection ? <p data-chk="editor-muted">{formatLabel(L.removesBand)}</p> : null}
      {!hidden ? (
        <div data-chk="editor-actions">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={locked}
            onClick={() =>
              run(editor.sections.add(band.id, { after: section.id }), [
                'layout',
                'bands',
                bandIndex,
                'sections',
                index + 1,
                'seatsPerRow',
              ])
            }
          >
            {formatLabel(L.addRight)}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={locked}
            onClick={() =>
              run(editor.sections.duplicate(ref), [
                'layout',
                'bands',
                bandIndex,
                'sections',
                index + 1,
                'seatsPerRow',
              ])
            }
          >
            {formatLabel(L.duplicate)}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={locked}
            onClick={() => {
              const issues = removeSectionOrBand(editor, band.id, section.id);
              run(issues);
              if (!issues.length) selection.clear();
            }}
          >
            {formatLabel(soleSection ? L.removeBand : L.remove)}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={locked || index === 0}
            aria-label={formatLabel(L.moveLeft)}
            onClick={() => run(editor.sections.move(ref, index - 1))}
          >
            ←
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={locked || index === band.sections.length - 1}
            aria-label={formatLabel(L.moveRight)}
            onClick={() => run(editor.sections.move(ref, index + 1))}
          >
            →
          </Button>
        </div>
      ) : null}
      <details data-chk="editor-advanced">
        <summary>{formatLabel(L.advanced)}</summary>
        <ColorField
          path={[...base, 'color']}
          label={formatLabel(L.sectionColor)}
          optional
          value={section.color}
          onCommit={(color) => patch(ref, { color })}
        />
        <TextField
          path={[...base, 'priceTier']}
          label={formatLabel(L.sectionPriceTier)}
          value={section.priceTier}
          placeholder={band.defaults?.priceTier ?? resolved.seatType}
          onCommit={(priceTier) => patch(ref, { priceTier: priceTier || undefined })}
        />
        {!exclude.hidden ? (
          <div data-chk="editor-field">
            <Button
              type="button"
              variant={exclusion ? 'primary' : 'secondary'}
              size="sm"
              aria-pressed={exclusion}
              disabled={exclude.disabled}
              data-chk-path={exclude.path}
              aria-invalid={exclude.invalid || undefined}
              aria-describedby={exclude.describedBy}
              onClick={() => {
                setExclusion(!exclusion);
                setView('2d');
              }}
            >
              {formatLabel(L.excludeMode)}
            </Button>
            {exclude.text ? (
              <p
                id={exclude.messageId}
                data-chk="editor-message"
                data-invalid={exclude.invalid || undefined}
              >
                {exclude.text}
              </p>
            ) : null}
            {exclusion ? <p data-chk="editor-muted">{formatLabel(L.excludeHint)}</p> : null}
          </div>
        ) : null}
      </details>
    </>
  );
}
