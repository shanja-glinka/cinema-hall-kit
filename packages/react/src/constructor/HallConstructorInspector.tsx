import { pathToString, priceForSeat, sumPrices } from '@cinema-hall/core';
import { partClass } from '../provider/provider.js';
import { formatLabel } from '../labels/labels.js';
import { useHallEditorContext } from './context.js';
import {
  selectionForIssue,
  useConstructorSelection,
  type ConstructorSelection,
} from './selection.js';
import { describeIssue, issueFocusTarget } from './issues-view.js';
import { HallConstructorIssues } from './HallConstructorIssues.js';
import { HallFields, ScreenFields } from './form/HallFields.js';
import { LayoutFields } from './form/LayoutFields.js';
import { ConstraintsFields } from './form/ConstraintsFields.js';
import { ZonesFields } from './form/ZonesFields.js';
import { ExtraFields } from './form/ExtraFields.js';
import { NumberField } from './fields/NumberField.js';
import { SectionInspector } from './inspector/SectionInspector.js';
import { BandInspector } from './inspector/BandInspector.js';
import { SeatTypesInspector } from './inspector/SeatTypesInspector.js';
import { generatedName, objectName } from './ui/names.js';

/** Optional host class for the contextual inspector. */
export interface HallConstructorInspectorProps {
  /** Class appended to the inspector part. */
  className?: string;
}

/**
 * Settings of the selected object, or the seat count, revenue and issues when selection is empty.
 * @param props Optional CSS class, appended to the inspector's part class.
 * @param props.className Class appended to the part.
 * @returns The contextual inspector; requires HallConstructorRoot.
 * @example <HallConstructorRoot editor={editor}><HallConstructorInspector /></HallConstructorRoot>
 */
export function HallConstructorInspector({ className }: HallConstructorInspectorProps) {
  const { editor, options, focus } = useHallEditorContext();
  const selection = useConstructorSelection();
  const L = options.labels.editor;
  const { Button } = options.slots;
  const selected = selection.selection;
  const bandIndex = editor.config.layout.bands.findIndex((b) => b.id === selected?.bandId);
  const band = editor.config.layout.bands[bandIndex];
  const sectionIndex = band?.sections.findIndex((s) => s.id === selected?.sectionId) ?? -1;
  const section = band?.sections[sectionIndex];
  const title =
    selected?.kind === 'section' && section
      ? (generatedName(section.id, L) ??
        formatLabel(L.sectionTitle, { name: objectName(section.id, L) }))
      : selected?.kind === 'band' && band
        ? (generatedName(band.id, L) ?? formatLabel(L.bandTitle, { id: objectName(band.id, L) }))
        : selected?.kind === 'screen'
          ? formatLabel(L.sectionScreen)
          : selected?.kind === 'hall'
            ? formatLabel(L.sectionHall)
            : selected?.kind === 'seatTypes'
              ? formatLabel(L.seatTypesPrices)
              : formatLabel(L.summary);
  const base =
    selected?.kind === 'section'
      ? ['layout', 'bands', bandIndex, 'sections', sectionIndex]
      : selected?.kind === 'band'
        ? ['layout', 'bands', bandIndex]
        : selected?.kind === 'seatTypes'
          ? ['seatTypes']
          : selected?.kind === 'screen'
            ? ['screen']
            : ['hall'];
  return (
    <aside
      data-chk="editor-inspector"
      aria-label={formatLabel(L.inspectorAria)}
      className={partClass(options, 'editorInspector', className)}
    >
      <div data-chk="editor-inspector-head">
        <h2
          tabIndex={-1}
          data-chk="editor-title"
          data-chk-path={pathToString(base)}
          data-chk-id={
            section && selected?.kind === 'section'
              ? `section:${section.id}`
              : band && selected?.kind === 'band'
                ? `band:${band.id}`
                : undefined
          }
        >
          {title}
        </h2>
        {selected ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={formatLabel(L.closeInspector)}
            onClick={selection.clear}
          >
            ×
          </Button>
        ) : null}
      </div>
      {selected?.kind === 'section' || selected?.kind === 'band' ? (
        <ObjectIssues base={base} target={selected} />
      ) : null}
      <div
        data-chk="editor-inspector-content"
        key={`${selected?.kind}:${selected?.bandId}:${selected?.sectionId}`}
      >
        {selected?.kind === 'section' && section && band ? (
          <SectionInspector
            band={band}
            section={section}
            bandIndex={bandIndex}
            index={sectionIndex}
          />
        ) : selected?.kind === 'band' && band ? (
          <BandInspector band={band} index={bandIndex} />
        ) : selected?.kind === 'screen' ? (
          <>
            <ScreenFields />
            <NumberField
              path={['layout', 'firstRowDistance']}
              label={formatLabel(L.firstRowDistance)}
              value={editor.config.layout.firstRowDistance}
              unit={formatLabel(L.unitMetres)}
              onCommit={(firstRowDistance) => editor.patch({ layout: { firstRowDistance } })}
            />
          </>
        ) : selected?.kind === 'hall' ? (
          <>
            <HallFields />
            <details
              data-chk="editor-advanced"
              open={
                focus.openSections.has('constraints') ||
                focus.openSections.has('zones') ||
                focus.openSections.has('extra')
              }
            >
              <summary>{formatLabel(L.advanced)}</summary>
              <LayoutFields />
              <h3 data-chk="editor-subtitle">{formatLabel(L.sectionConstraints)}</h3>
              <ConstraintsFields />
              <h3 data-chk="editor-subtitle">{formatLabel(L.sectionZones)}</h3>
              <ZonesFields />
              <h3 data-chk="editor-subtitle">{formatLabel(L.sectionExtra)}</h3>
              <ExtraFields />
            </details>
          </>
        ) : selected?.kind === 'seatTypes' ? (
          <SeatTypesInspector />
        ) : (
          <HallSummary />
        )}
      </div>
    </aside>
  );
}

/**
 * Problems about the whole selected band or section (not a single field), in plain words with the
 * numbers: a band that goes past the back wall, a missing section, a view warning. Field problems
 * stay under their field.
 */
function ObjectIssues({
  base,
  target,
}: {
  base: readonly (string | number)[];
  target: ConstructorSelection;
}) {
  const { editor, save, options } = useHallEditorContext();
  const items = [...editor.issues, ...save.serverIssues].filter((issue) => {
    const place = issueFocusTarget(issue, editor.config);
    const owner = selectionForIssue(editor.config, place.path, place.ref);
    return (
      owner.kind === target.kind &&
      owner.bandId === target.bandId &&
      owner.sectionId === target.sectionId &&
      place.path.length <= base.length
    );
  });
  if (items.length === 0) return null;
  return (
    <ul data-chk="editor-object-issues">
      {items.map((issue, index) => (
        <li key={`${issue.code}-${index}`} data-severity={issue.severity}>
          {describeIssue(issue, options.labels.editor, options.locale)}
        </li>
      ))}
    </ul>
  );
}

function HallSummary() {
  const { editor, options, selection } = useHallEditorContext();
  const L = options.labels.editor;
  const { Button } = options.slots;
  const revenue =
    editor.layout.seats.length === 0
      ? 0
      : sumPrices(editor.layout.seats.map((seat) => priceForSeat(editor.layout.pricing, seat)));
  return (
    <>
      <p data-chk="editor-total">
        {formatLabel(L.seatCount, { count: editor.layout.seats.length })}
      </p>
      <dl data-chk="editor-totals">
        {Object.entries(editor.layout.seatTypes).map(([id, type]) => (
          <div key={id}>
            <dt>
              <span data-chk="editor-swatch" style={{ background: type.color }} />
              {type.label}
            </dt>
            <dd>{editor.layout.seats.filter((s) => s.seatTypeId === id).length}</dd>
          </div>
        ))}
      </dl>
      <div data-chk="editor-revenue">
        <p data-chk="editor-muted">{formatLabel(L.revenue)}</p>
        <strong>
          {revenue === null ? formatLabel(L.priceMissing) : options.formatPrice(revenue)}
        </strong>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => selection.select({ kind: 'seatTypes' })}
      >
        {formatLabel(L.seatTypesPrices)}
      </Button>
      <HallConstructorIssues />
      <p data-chk="editor-hint">{formatLabel(L.selectHint)}</p>
    </>
  );
}
