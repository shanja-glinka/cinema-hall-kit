import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { buildHallLayout, type Issue, type SectionBox } from '@cinema-hall/core';
import { partClass } from '../provider/provider.js';
import { HallPreview } from '../seat-view/HallPreview.js';
import { formatLabel } from '../labels/labels.js';
import { useHallEditorContext } from './context.js';
import { describeIssue, issueFocusTarget, sectionIdsWithErrors } from './issues-view.js';
import {
  selectionForIssue,
  useConstructorSelection,
  type ConstructorSelection,
} from './selection.js';
import { isHidden, isLocked, removeSectionOrBand, useActionRunner } from './form/shared.js';
import { generatedName, objectName } from './ui/names.js';
import { usePlanNavigation } from './ui/use-plan-navigation.js';
import { useMounted } from './ui/hooks.js';

/**
 * Conservative glyph width of a band label in plan metres: one em of the 0.42 m font. No common
 * font has glyphs wider than 1 em (even 'W' in Helvetica is ≈ 0.94 em), so labels are never clipped.
 */
const BAND_GLYPH = 0.42;

/** Optional host class for the plan or 3D canvas. */
export interface HallConstructorCanvasProps {
  /** Class appended to the canvas part. */
  className?: string;
}

/**
 * To-scale hall plan with object selection, issues, seat exclusion, pan/zoom and an optional 3D view.
 * @param props Optional CSS class appended to the canvas part.
 * @param props.className Class appended to the part.
 * @returns The interactive canvas; requires HallConstructorRoot.
 * @example <HallConstructorRoot editor={editor}><HallConstructorCanvas /></HallConstructorRoot>
 */
export function HallConstructorCanvas({ className }: HallConstructorCanvasProps) {
  const { editor, options, readOnly, save, view, setView, exclusion } = useHallEditorContext();
  const selection = useConstructorSelection();
  const L = options.labels.editor;
  const { Button } = options.slots;
  const svg = useRef<SVGSVGElement>(null);
  const mounted = useMounted();
  const { run } = useActionRunner();
  const layout = editor.layout;
  const { hall, screen } = layout;
  const selected = selection.selection;
  const savedLayout = useMemo(() => buildHallLayout(editor.baseline), [editor.baseline]);
  const liveKeys = new Set(layout.seats.map((s) => s.key));
  // The 3D view shows the removed booked seats too, as the plan does with its ghost dots.
  const previewLayout = useMemo(() => {
    const removed = savedLayout.seats.filter(
      (s) => save.highlightKeys.includes(s.key) && !layout.seats.some((live) => live.key === s.key),
    );
    if (removed.length === 0) return layout;
    const seatTypes = { ...savedLayout.seatTypes, ...layout.seatTypes };
    // The preview room (walls and orbit limits) grows to hold the removed seats, so their highlight
    // is neither hidden behind a wall nor out of the camera's reach. Only in this feedback state.
    let depth = layout.hall.depth;
    let halfWidth = layout.hall.width / 2;
    let height = layout.hall.height;
    for (const seat of removed) {
      const type = seatTypes[seat.seatTypeId];
      depth = Math.max(depth, seat.position.z + (type?.depth ?? 0.8) / 2 + 0.5);
      halfWidth = Math.max(halfWidth, Math.abs(seat.position.x) + (type?.width ?? 0.6) / 2 + 0.5);
      // The seat, a seated person above it (about 1.4 m) and some air: a high riser must not poke
      // through the ceiling.
      height = Math.max(height, seat.position.y + 1.4 + 0.5);
    }
    return {
      ...layout,
      hall: { ...layout.hall, depth, width: halfWidth * 2, height },
      seats: [...layout.seats, ...removed],
      seatTypes,
    };
  }, [layout, savedLayout, save.highlightKeys]);
  const ghosts = savedLayout.seats.filter(
    (s) => save.highlightKeys.includes(s.key) && !liveKeys.has(s.key),
  );
  const left = Math.min(
    -hall.width / 2,
    ...layout.sections.map((s) => s.minX),
    ...ghosts.map((s) => s.position.x),
  );
  const right = Math.max(
    hall.width / 2,
    ...layout.sections.map((s) => s.maxX),
    ...ghosts.map((s) => s.position.x),
  );
  const bottom = Math.max(
    hall.depth,
    ...layout.sections.map((s) => s.maxZ),
    ...ghosts.map((s) => s.position.z),
  );
  // The band label column sits left of the plan and is as wide as its longest line (the font is
  // 0.42 m tall, so a glyph is at most about 0.3 m wide): the view box always includes all of it.
  const bandLabelLines = (index: number, id: string): string[] => [
    formatLabel(L.bandTitle, { id: index + 1 }),
    generatedName(id, L) === null ? objectName(id, L) : '',
  ];
  // The estimate covers the first render; after it the real rendered width of every label (in plan
  // units, so independent of zoom, host font and weight) is measured and the column grows to fit it.
  const [measuredLabel, setMeasuredLabel] = useState(0);
  const labelColumn = Math.max(
    3.2,
    measuredLabel + 0.8,
    ...editor.config.layout.bands.flatMap((band, index) =>
      bandLabelLines(index, band.id).map((line) => line.length * BAND_GLYPH + 0.8),
    ),
  );
  // Web fonts that finish loading later change the rendered width: re-measure when they do.
  const [fontEpoch, setFontEpoch] = useState(0);
  useEffect(() => {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    if (!fonts?.addEventListener) return undefined;
    const bump = () => setFontEpoch((n) => n + 1);
    fonts.addEventListener('loadingdone', bump);
    return () => fonts.removeEventListener('loadingdone', bump);
  }, []);
  useLayoutEffect(() => {
    // While the 3D view replaces the plan there is nothing to measure: keep the last measurement.
    if (!svg.current) return;
    const texts = svg.current.querySelectorAll<SVGTextElement>('[data-chk="editor-band-label"]');
    let widest = 0;
    texts.forEach((text) => {
      if (typeof text.getBBox !== 'function') return;
      try {
        widest = Math.max(widest, text.getBBox().width);
      } catch {
        /* not rendered (e.g. display: none) */
      }
    });
    if (widest > 0 && Number.isFinite(widest) && Math.abs(widest - measuredLabel) > 0.01)
      setMeasuredLabel(widest);
  }, [measuredLabel, editor.config.layout.bands, L, view, fontEpoch]);
  const bounds = {
    x: left - 0.4 - labelColumn - 0.6,
    y: -1.5,
    width: right - (left - 0.4 - labelColumn - 0.6) + 2,
    height: bottom + 3.5,
  };
  const nav = usePlanNavigation(svg, bounds);
  const allIssues = [...editor.issues, ...save.serverIssues];
  const same = (a: ConstructorSelection | null, b: ConstructorSelection) =>
    a?.kind === b.kind && a.bandId === b.bandId && a.sectionId === b.sectionId;
  const object = (target: ConstructorSelection, label: string) => ({
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    'data-object': true,
    'data-selected': same(selected, target) || undefined,
    onClick: () => selection.select(target),
    onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selection.select(target);
      }
    },
  });
  const keyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key.startsWith('Arrow')) {
      const nodes = [...(svg.current?.querySelectorAll<SVGElement>('[data-object]') ?? [])];
      const at = nodes.indexOf(document.activeElement as SVGElement);
      const next =
        nodes[
          (at + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + nodes.length) %
            nodes.length
        ];
      event.preventDefault();
      next?.focus();
      next?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    } else if (
      event.key === 'Delete' &&
      selected?.kind === 'section' &&
      !isLocked(editor, 'structure.sections', readOnly)
    ) {
      event.preventDefault();
      const issues = removeSectionOrBand(editor, selected.bandId, selected.sectionId);
      run(issues);
      if (!issues.length) selection.clear();
    }
  };
  const badges = (target: ConstructorSelection, x: number, y: number) => {
    const issues = allIssues.filter((issue) => {
      const result = issueFocusTarget(issue, editor.config);
      return same(selectionForIssue(editor.config, result.path, result.ref), target);
    });
    if (!issues.length) return null;
    const issue = issues.find((i) => i.severity === 'error') ?? issues[0];
    if (!issue) return null;
    return <IssueBadge issue={issue} x={x} y={y} count={issues.length} />;
  };
  const sectionDots = (box: SectionBox) => {
    const band = editor.config.layout.bands.find((b) => b.id === box.bandId);
    const section = band?.sections.find((s) => s.id === box.sectionId);
    const excludes = new Set(section?.exclude ?? []);
    const editing =
      exclusion && selected?.kind === 'section' && selected.sectionId === box.sectionId;
    const disabled = readOnly || (editor.policy['section.exclude'] ?? 'editable') !== 'editable';
    return Array.from({ length: box.rows }, (_, row) =>
      Array.from({ length: box.seatsPerRow }, (_, col) => {
        const local = `r${row + 1}.s${col + 1}`;
        const key = `${box.sectionId}.${local}`;
        const excluded = excludes.has(local);
        if (excluded && !editing) return null;
        const x = box.minX + (col + 0.5) * box.seatPitch;
        const y = box.minZ + (row + 0.5) * box.rowSpacing;
        const paint = section?.color ?? layout.seatTypes[box.seatTypeId]?.color;
        const toggle = () => {
          if (!editing || disabled || !section) return;
          const next = new Set(excludes);
          if (next.has(local)) next.delete(local);
          else next.add(local);
          run(
            editor.sections.patch(
              { bandId: box.bandId, sectionId: box.sectionId },
              { exclude: next.size ? [...next] : undefined },
            ),
          );
        };
        return (
          <circle
            key={key}
            cx={x}
            cy={y}
            r={Math.min(box.seatPitch * 0.26, 0.17)}
            data-chk="editor-seat"
            data-key={key}
            data-excluded={excluded || undefined}
            data-status={save.highlightKeys.includes(key) ? 'in-use' : undefined}
            style={{ fill: paint }}
            role={editing ? 'button' : undefined}
            tabIndex={editing ? 0 : undefined}
            aria-label={editing ? formatLabel(L.seatAction, { key }) : undefined}
            aria-pressed={editing ? excluded : undefined}
            aria-disabled={(editing && disabled) || undefined}
            onClick={(event) => {
              if (editing) {
                event.stopPropagation();
                toggle();
              }
            }}
            onKeyDown={(event) => {
              if (editing && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                event.stopPropagation();
                toggle();
              }
            }}
          />
        );
      }),
    );
  };
  const highlightSections = sectionIdsWithErrors(allIssues, editor.config.layout.bands);
  if (selected?.kind === 'section') highlightSections.push(selected.sectionId);
  return (
    <section
      data-chk="editor-canvas"
      aria-label={formatLabel(L.planAria)}
      className={partClass(options, 'editorCanvas', className)}
    >
      {view === '3d' && mounted ? (
        <HallPreview
          layout={previewLayout}
          highlightSections={highlightSections}
          highlightKeys={save.highlightKeys}
        />
      ) : (
        <svg
          ref={svg}
          data-chk="editor-plan"
          viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
          aria-label={formatLabel(L.planAria)}
          role="group"
          onKeyDown={keyDown}
          onPointerDown={nav.onPointerDown}
          onPointerMove={nav.onPointerMove}
          onPointerUp={nav.onPointerUp}
          onPointerCancel={nav.onPointerUp}
          onClickCapture={(event) => {
            if (nav.consumeClick()) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) selection.select({ kind: 'hall' });
          }}
        >
          <g transform={nav.transform}>
            <g
              {...object({ kind: 'hall' }, formatLabel(L.sectionHall))}
              data-chk="editor-hall-object"
            >
              <rect x={-hall.width / 2} y={0} width={hall.width} height={hall.depth} rx={0.25} />
            </g>
            <g data-chk="editor-dimensions" aria-hidden="true">
              <path
                d={`M ${-hall.width / 2} -0.7 H ${hall.width / 2} M ${hall.width / 2 + 0.65} 0 V ${hall.depth}`}
              />
              <text x={0} y={-0.9} textAnchor="middle">
                {hall.width} {formatLabel(L.unitMetres)}
              </text>
              <text
                x={hall.width / 2 + 0.85}
                y={hall.depth / 2}
                transform={`rotate(90 ${hall.width / 2 + 0.85} ${hall.depth / 2})`}
                textAnchor="middle"
              >
                {hall.depth} {formatLabel(L.unitMetres)}
              </text>
              <path
                d={`M ${-hall.width / 2 + 0.5} 0.6 V ${editor.config.layout.firstRowDistance}`}
              />
              <text
                x={-hall.width / 2 + 0.7}
                y={Math.max(1.5, editor.config.layout.firstRowDistance / 2)}
              >
                {editor.config.layout.firstRowDistance} {formatLabel(L.unitMetres)}
              </text>
            </g>
            <g
              {...object({ kind: 'screen' }, formatLabel(L.sectionScreen))}
              data-chk="editor-screen-object"
            >
              <rect x={-screen.width / 2} y={0.4} width={screen.width} height={0.2} rx={0.1} />
              <rect
                data-chk="editor-screen-hit"
                x={-screen.width / 2}
                y={0.05}
                width={screen.width}
                height={1.3}
              />
              <text x={0} y={1.1} textAnchor="middle">
                {formatLabel(L.sectionScreen).toUpperCase()}
              </text>
            </g>
            {badges({ kind: 'screen' }, screen.width / 2 + 0.1, 0.6)}
            {badges({ kind: 'hall' }, hall.width / 2 - 0.4, 1.8)}
            {badges({ kind: 'seatTypes' }, hall.width / 2 - 0.4, 2.7)}
            {editor.config.layout.bands.map((band, index) => {
              const boxes = layout.sections.filter((s) => s.bandId === band.id);
              const top = boxes.length ? Math.min(...boxes.map((s) => s.minZ)) : 2 + index;
              const bandRight = boxes.length
                ? Math.max(...boxes.map((s) => s.maxX))
                : hall.width / 2 - 1;
              return (
                <g key={band.id}>
                  <g
                    {...object(
                      { kind: 'band', bandId: band.id },
                      formatLabel(L.bandCanvas, {
                        number: index + 1,
                        name: objectName(band.id, L),
                      }),
                    )}
                    data-chk="editor-band-object"
                  >
                    <rect
                      x={left - 0.2 - labelColumn}
                      y={top}
                      width={labelColumn}
                      height={1.4}
                      rx={0.16}
                    />
                    <text
                      x={left - 0.4}
                      y={top + 0.45}
                      textAnchor="end"
                      data-chk="editor-band-label"
                    >
                      {bandLabelLines(index, band.id)[0]}
                    </text>
                    <text
                      x={left - 0.4}
                      y={top + 0.9}
                      textAnchor="end"
                      data-chk="editor-band-label"
                    >
                      {bandLabelLines(index, band.id)[1]}
                    </text>
                  </g>
                  {badges({ kind: 'band', bandId: band.id }, left - 0.4, top + 1.35)}
                  {boxes.map((box) => (
                    <g key={box.sectionId}>
                      <g
                        {...object(
                          { kind: 'section', bandId: band.id, sectionId: box.sectionId },
                          `${generatedName(box.sectionId, L) ?? formatLabel(L.sectionTitle, { name: objectName(box.sectionId, L) })} · ${box.sectionId}`,
                        )}
                        data-chk="editor-section-object"
                        data-section={box.sectionId}
                      >
                        <rect
                          x={box.minX}
                          y={box.minZ}
                          width={Math.max(0.2, box.maxX - box.minX)}
                          height={Math.max(0.4, box.maxZ - box.minZ)}
                          rx={0.18}
                        />
                        <text x={(box.minX + box.maxX) / 2} y={box.minZ - 0.1} textAnchor="middle">
                          {objectName(box.sectionId, L)}
                        </text>
                        {sectionDots(box)}
                      </g>
                      {badges(
                        { kind: 'section', bandId: band.id, sectionId: box.sectionId },
                        box.maxX,
                        box.minZ,
                      )}
                    </g>
                  ))}
                  {!isHidden(editor, 'structure.sections') ? (
                    <g
                      role="button"
                      tabIndex={0}
                      data-chk="editor-add-section"
                      aria-disabled={isLocked(editor, 'structure.sections', readOnly)}
                      aria-label={`${formatLabel(L.addRight)} · ${band.id}`}
                      onClick={() => {
                        if (!isLocked(editor, 'structure.sections', readOnly))
                          run(editor.sections.add(band.id), [
                            'layout',
                            'bands',
                            index,
                            'sections',
                            band.sections.length,
                            'seatsPerRow',
                          ]);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          if (!isLocked(editor, 'structure.sections', readOnly))
                            run(editor.sections.add(band.id), [
                              'layout',
                              'bands',
                              index,
                              'sections',
                              band.sections.length,
                              'seatsPerRow',
                            ]);
                        }
                      }}
                    >
                      <rect x={bandRight + 0.15} y={top + 0.3} width={0.8} height={0.8} rx={0.2} />
                      <text x={bandRight + 0.55} y={top + 0.88} textAnchor="middle">
                        +
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}
            {ghosts.map((seat) => (
              <circle
                key={seat.key}
                data-chk="editor-seat"
                data-ghost
                pointerEvents="none"
                data-status="in-use"
                data-key={seat.key}
                cx={seat.position.x}
                cy={seat.position.z}
                r={0.19}
              >
                <title>{formatLabel(L.seatAction, { key: seat.key })}</title>
              </circle>
            ))}
          </g>
        </svg>
      )}
      <div data-chk="editor-canvas-footer">
        {!isHidden(editor, 'structure.bands') ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isLocked(editor, 'structure.bands', readOnly)}
            onClick={() =>
              run(editor.bands.add(), [
                'layout',
                'bands',
                editor.config.layout.bands.length,
                'gapBefore',
              ])
            }
          >
            {formatLabel(L.addBand)}
          </Button>
        ) : null}
        <p data-chk="editor-plan-hint">{formatLabel(exclusion ? L.excludeHint : L.planHint)}</p>
        <div className="chk-glass" data-chk="editor-view-tools">
          <Button type="button" variant="ghost" size="sm" onClick={nav.reset}>
            {formatLabel(L.fit)}
          </Button>
          <div role="group" aria-label={formatLabel(L.previewAria)}>
            {(['2d', '3d'] as const).map((mode) => (
              <Button
                type="button"
                key={mode}
                variant={view === mode ? 'primary' : 'ghost'}
                size="sm"
                aria-pressed={view === mode}
                onClick={() => setView(mode)}
              >
                {formatLabel(mode === '2d' ? L.viewMap : L.view3d)}
              </Button>
            ))}
          </div>
        </div>
      </div>
      {save.highlightKeys.length ? (
        <p role="status" data-chk="editor-canvas-note">
          {formatLabel(L.seatsBooked, { keys: save.highlightKeys.join(', ') })}
        </p>
      ) : null}
    </section>
  );
}

function IssueBadge({ issue, x, y, count }: { issue: Issue; x: number; y: number; count: number }) {
  const { editor, options, focus } = useHallEditorContext();
  const label = describeIssue(issue, options.labels.editor, options.locale);
  const activate = () => {
    const target = issueFocusTarget(issue, editor.config);
    focus.requestFocus(target.path, target.ref);
  };
  return (
    <g
      data-chk="editor-issue-badge"
      data-severity={issue.severity}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      }}
    >
      <title>{count > 1 ? `${label} (+${count - 1})` : label}</title>
      {issue.severity === 'error' ? (
        <circle cx={x} cy={y} r={0.36} />
      ) : (
        <path d={`M ${x} ${y - 0.4} L ${x + 0.4} ${y + 0.3} L ${x - 0.4} ${y + 0.3} Z`} />
      )}
      <text x={x} y={y + 0.17} textAnchor="middle">
        !
      </text>
    </g>
  );
}
