import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { buildHallLayout, type Issue, type SectionBox } from '@cinema-hall/core';
import { partClass } from '../provider/provider.js';
import { HallPreview } from '../seat-view/HallPreview.js';
import { formatLabel } from '../labels/labels.js';
import { editorLabel } from '../labels/editor-labels.js';
import { useHallEditorContext } from './context.js';
import {
  describeIssue,
  issueFocusTarget,
  bandDisplayName,
  sectionDisplayName,
  sectionIdsWithErrors,
} from './issues-view.js';
import { editorConstraints, latestConfig } from './editor/use-hall-editor.js';
import { EditorLighting } from '../scene/editor-lighting.js';
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

/** Font size of section names on the plan, in plan metres at normal size. */
const SECTION_FONT = 0.34;
/** The smallest on-screen size of plan text, in CSS pixels: deep halls at "Fit hall" stay readable. */
export const MIN_PLAN_TEXT_PX = 11;
/** Plan text grows at most this much over its normal size, so labels do not cover the seats. */
const MAX_TEXT_SCALE = 2.4;

/**
 * How much plan text must grow to stay readable: the factor that brings the section names to
 * `MIN_PLAN_TEXT_PX` on screen, between 1 and `MAX_TEXT_SCALE`, in steps of 0.1 (so it does not
 * flicker while the plan is resized). 1 before the plan has been measured.
 * @param pixelsPerMetre Screen pixels per plan metre.
 * @returns The text scale.
 */
export function planTextScale(pixelsPerMetre: number): number {
  if (!(pixelsPerMetre > 0)) return 1;
  const needed = MIN_PLAN_TEXT_PX / (SECTION_FONT * pixelsPerMetre);
  return Math.min(MAX_TEXT_SCALE, Math.max(1, Math.ceil(needed * 10 - 1e-9) / 10));
}

/**
 * Where the name of a section goes: above its block when there is room before the blocks of the
 * bands in front (or the screen), else just inside the top of its block, so the names of a band never
 * sit on the last row of the band before it. A block with a block of another level over the strip above
 * it (a balcony over the stalls, or the stalls under a balcony) gets its name inside.
 * @param box The section's block.
 * @param boxes Every block of the plan.
 * @param fontSize Font size in plan metres.
 * @returns The baseline of the name and whether it is inside the block.
 */
export function sectionLabelPlacement(
  box: SectionBox,
  boxes: readonly SectionBox[],
  fontSize: number,
): { y: number; inside: boolean } {
  // The screen and its caption take the first 1.4 m.
  let above = 1.4;
  for (const other of boxes) {
    if (other.bandId === box.bandId || other.maxZ > box.minZ + 1e-6) continue;
    if (other.maxX <= box.minX || other.minX >= box.maxX) continue;
    above = Math.max(above, other.maxZ);
  }
  // A block of another level over or under the strip above this one (a balcony over the stalls)
  // would draw the name across its seats: the name goes inside then.
  const stripTop = box.minZ - fontSize - 0.15;
  const covered = boxes.some(
    (other) =>
      other !== box &&
      (other.level ?? 0) !== (box.level ?? 0) &&
      other.maxX > box.minX &&
      other.minX < box.maxX &&
      other.maxZ > stripTop + 1e-6 &&
      other.minZ < box.minZ - 1e-6,
  );
  if (!covered && box.minZ - above >= fontSize + 0.15) return { y: box.minZ - 0.1, inside: false };
  return { y: box.minZ + fontSize * 0.85 + 0.04, inside: true };
}

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
  const { editor, options, readOnly, save, view, setView, exclusion, notify } =
    useHallEditorContext();
  const selection = useConstructorSelection();
  const L = options.labels.editor;
  const { Button } = options.slots;
  const svg = useRef<SVGSVGElement>(null);
  const mounted = useMounted();
  const { run } = useActionRunner();
  const layout = editor.layout;
  const { hall, screen } = layout;
  const selected = selection.selection;
  // Levels of a multi-level hall: the plan draws the upper ones over the floor below and can show
  // one level at a time, so the bands under a balcony can be selected too.
  // `bands` is optional on a hand-built layout: such a hall has the ground floor only.
  const bandBoxes = layout.bands ?? [];
  const bandLevel = new Map(bandBoxes.map((band) => [band.id, band.level]));
  const levelOf = (bandId: string): number => bandLevel.get(bandId) ?? 0;
  const levels = [...new Set(bandBoxes.map((band) => band.level))].sort((a, b) => a - b);
  const multiLevel = levels.length > 1;
  const [levelChoice, setLevelChoice] = useState<'all' | number>('all');
  const levelFilter =
    levelChoice !== 'all' && levels.includes(levelChoice) ? levelChoice : ('all' as const);
  const selectedLevel =
    selected?.bandId !== undefined && bandLevel.has(selected.bandId)
      ? levelOf(selected.bandId)
      : undefined;
  // An object selected elsewhere (an issue, the inspector) on a level the plan hides: show its
  // level. Only a new selection does this; choosing another level keeps the choice.
  const selectionKey = selected
    ? `${selected.kind}:${selected.bandId ?? ''}:${selected.sectionId ?? ''}`
    : '';
  const shownFor = useRef(selectionKey);
  useEffect(() => {
    if (shownFor.current === selectionKey) return;
    shownFor.current = selectionKey;
    if (levelFilter !== 'all' && selectedLevel !== undefined && selectedLevel !== levelFilter)
      setLevelChoice(selectedLevel);
  }, [selectionKey, levelFilter, selectedLevel]);
  const constraints = editorConstraints(editor);
  const savedLayout = useMemo(
    () => buildHallLayout(editor.baseline, { constraints }),
    [editor.baseline, constraints],
  );
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
  const bandLabelLines = (index: number, id: string): string[] => {
    const label = editor.config.layout.bands.find((band) => band.id === id)?.label;
    const level = levelOf(id);
    return [
      formatLabel(L.bandTitle, { id: index + 1 }),
      label ?? (generatedName(id, L) === null ? objectName(id, L) : ''),
      ...(level > 0 ? [formatLabel(editorLabel(L, 'planLevelBadge'), { level })] : []),
    ];
  };
  // The estimate covers the first render; after it the real rendered width of every label (in plan
  // units, so independent of zoom, host font and weight) is measured and the column grows to fit it.
  const [measuredLabel, setMeasuredLabel] = useState(0);
  // Plan text keeps a readable size on screen; the scale comes from the last measured zoom.
  const [textScale, setTextScale] = useState(1);
  const labelColumn = Math.max(
    3.2,
    measuredLabel + 0.8,
    ...editor.config.layout.bands.flatMap((band, index) =>
      bandLabelLines(index, band.id).map((line) => line.length * BAND_GLYPH * textScale + 0.8),
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
  }, [measuredLabel, editor.config.layout.bands, L, view, fontEpoch, textScale]);
  const levelShown = (bandId: string): boolean =>
    levelFilter === 'all' || levelOf(bandId) === levelFilter;
  // Upper levels are drawn after the floor below, so they are on top and take the clicks there.
  const drawOrder = editor.config.layout.bands
    .map((band, index) => ({ band, index }))
    .sort((a, b) => levelOf(a.band.id) - levelOf(b.band.id) || a.index - b.index);
  const bandTop = (bandId: string, index: number): number => {
    const boxes = layout.sections.filter((s) => s.bandId === bandId);
    return boxes.length ? Math.min(...boxes.map((s) => s.minZ)) : 2 + index;
  };
  // Band labels of overlapping bands (a balcony over the stalls) would sit on each other in the
  // label column: each one moves down below the one above it.
  const labelHeight = (bandId: string): number => (levelOf(bandId) > 0 ? 1.85 : 1.4) * textScale;
  const labelTops = new Map<string, number>();
  // Where the last stacked label ends: the view box reaches down to it, so "Fit hall" shows every
  // label and its selection button even when many short bands push the stack below the hall.
  let labelEnd = Number.NEGATIVE_INFINITY;
  editor.config.layout.bands
    .map((band, index) => ({ id: band.id, top: bandTop(band.id, index) }))
    .filter((item) => levelShown(item.id))
    .sort((a, b) => a.top - b.top)
    .forEach((item) => {
      const y = Math.max(item.top, labelEnd + 0.1);
      labelTops.set(item.id, y);
      labelEnd = y + labelHeight(item.id);
    });
  const bounds = {
    x: left - 0.4 - labelColumn - 0.6,
    y: -1.5,
    width: right - (left - 0.4 - labelColumn - 0.6) + 2,
    height: Math.max(bottom, labelEnd) + 3.5,
  };
  const nav = usePlanNavigation(svg, bounds);
  const nextTextScale = planTextScale(nav.pixelsPerMetre);
  useEffect(() => {
    if (nextTextScale !== textScale) setTextScale(nextTextScale);
  }, [nextTextScale, textScale]);
  const sectionFont = SECTION_FONT * textScale;
  const bandFont = BAND_GLYPH * textScale;
  // Blocks of the upper levels, to find the floor seats under them.
  const upperBoxes = layout.sections.filter((s) => levelOf(s.bandId) > 0);
  const addBand = (): void => {
    const before = latestConfig(editor).hall.depth;
    // A new row of sections that does not fit makes the hall deeper, and says so; where the policy
    // keeps the depth, it is added without that.
    let issues = editor.bands.add({ growHall: true });
    if (issues.length > 0) issues = editor.bands.add();
    run(issues, ['layout', 'bands', editor.config.layout.bands.length, 'gapBefore']);
    const after = latestConfig(editor).hall.depth;
    if (issues.length === 0 && after > before)
      notify(formatLabel(editorLabel(L, 'bandAddedGrown'), { value: after }), 'info');
  };
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
        >
          <EditorLighting hall={previewLayout.hall} />
        </HallPreview>
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
            <g
              data-chk="editor-dimensions"
              aria-hidden="true"
              style={{ fontSize: `${0.42 * textScale}px` }}
            >
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
            {drawOrder.map(({ band, index }) => {
              const boxes = layout.sections.filter((s) => s.bandId === band.id);
              const top = bandTop(band.id, index);
              const level = levelOf(band.id);
              const upper = level > 0 || undefined;
              if (!levelShown(band.id)) {
                // Another level than the one shown: an outline for orientation, not selectable.
                return (
                  <g
                    key={band.id}
                    data-chk="editor-level-ghost"
                    data-level={level}
                    aria-hidden="true"
                    pointerEvents="none"
                  >
                    {boxes.map((box) => (
                      <rect
                        key={box.sectionId}
                        x={box.minX}
                        y={box.minZ}
                        width={Math.max(0.2, box.maxX - box.minX)}
                        height={Math.max(0.4, box.maxZ - box.minZ)}
                        rx={0.18}
                      />
                    ))}
                  </g>
                );
              }
              const labelTop = labelTops.get(band.id) ?? top;
              const lines = bandLabelLines(index, band.id);
              const bandRight = boxes.length
                ? Math.max(...boxes.map((s) => s.maxX))
                : hall.width / 2 - 1;
              const dimmed =
                levelFilter === 'all' &&
                multiLevel &&
                selectedLevel !== undefined &&
                selectedLevel !== level;
              // With every level shown, the floor under a balcony is drawn fainter, so the balcony
              // on top of it reads as a separate level. Selecting it (or its level) lifts that.
              const covered =
                !dimmed &&
                levelFilter === 'all' &&
                level === 0 &&
                selectedLevel !== 0 &&
                boxes.some((box) => coveredByUpper(box, upperBoxes));
              return (
                <g
                  key={band.id}
                  data-chk="editor-band-group"
                  data-band={band.id}
                  data-level={level}
                  data-upper={upper}
                  data-dimmed={dimmed || undefined}
                  data-covered={covered || undefined}
                >
                  <g
                    {...object({ kind: 'band', bandId: band.id }, bandDisplayName(band, index, L))}
                    data-chk="editor-band-object"
                    data-upper={upper}
                  >
                    <rect
                      x={left - 0.2 - labelColumn}
                      y={labelTop}
                      width={labelColumn}
                      height={labelHeight(band.id)}
                      rx={0.16}
                    />
                    {lines.map((line, row) => (
                      <text
                        key={row}
                        x={left - 0.4}
                        y={labelTop + (0.45 + 0.45 * row) * textScale}
                        textAnchor="end"
                        data-chk="editor-band-label"
                        data-level-badge={row === 2 || undefined}
                        style={{ fontSize: `${bandFont}px` }}
                      >
                        {line}
                      </text>
                    ))}
                  </g>
                  {/* Left of the label column's edge, clear of the hall wall. */}
                  {badges(
                    { kind: 'band', bandId: band.id },
                    left - 0.95,
                    labelTop + labelHeight(band.id) - 0.05 * textScale,
                  )}
                  {upper && boxes.length ? (
                    <rect
                      data-chk="editor-level-outline"
                      pointerEvents="none"
                      x={Math.min(...boxes.map((s) => s.minX)) - 0.15}
                      y={top - 0.15}
                      width={
                        Math.max(...boxes.map((s) => s.maxX)) -
                        Math.min(...boxes.map((s) => s.minX)) +
                        0.3
                      }
                      height={Math.max(...boxes.map((s) => s.maxZ)) - top + 0.3}
                      rx={0.3}
                    />
                  ) : null}
                  {boxes.map((box) => (
                    <g key={box.sectionId}>
                      <g
                        {...object(
                          { kind: 'section', bandId: band.id, sectionId: box.sectionId },
                          `${sectionDisplayName(box.sectionId, band.id, L)} · ${box.sectionId}`,
                        )}
                        data-chk="editor-section-object"
                        data-section={box.sectionId}
                        data-upper={upper}
                      >
                        {/* Exactly the layout's block: sections without an aisle touch, with
                            square corners so no gap appears between them. */}
                        <rect
                          x={box.minX}
                          y={box.minZ}
                          width={Math.max(0.2, box.maxX - box.minX)}
                          height={Math.max(0.4, box.maxZ - box.minZ)}
                          rx={touchesNeighbour(box, boxes) ? 0 : 0.18}
                          data-joined={touchesNeighbour(box, boxes) || undefined}
                        />
                        <SectionName
                          box={box}
                          boxes={layout.sections}
                          fontSize={sectionFont}
                          name={objectName(box.sectionId, L, band.id)}
                        />
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
                      aria-label={`${formatLabel(L.addRight)} · ${bandDisplayName(band, index, L)}`}
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
            onClick={addBand}
          >
            {formatLabel(L.addBand)}
          </Button>
        ) : null}
        {/* The hints get a row of their own under the buttons, so they never squeeze them. */}
        <p data-chk="editor-plan-hint">
          <span data-chk="editor-plan-tip" data-exclusion={exclusion || undefined}>
            {formatLabel(exclusion ? L.excludeHint : L.planHint)}
          </span>
          {multiLevel && view === '2d' ? (
            <span data-chk="editor-level-hint">{formatLabel(editorLabel(L, 'levelHint'))}</span>
          ) : null}
          {multiLevel && view === '2d' && levelFilter === 'all' ? (
            <span data-chk="editor-level-legend">
              <span data-chk="editor-level-legend-item" data-kind="ground">
                {formatLabel(editorLabel(L, 'levelLegendGround'))}
              </span>
              <span data-chk="editor-level-legend-item" data-kind="upper">
                {formatLabel(editorLabel(L, 'levelLegendUpper'))}
              </span>
            </span>
          ) : null}
        </p>
        <div className="chk-glass" data-chk="editor-view-tools">
          {multiLevel && view === '2d' ? (
            <div
              role="group"
              data-chk="editor-level-filter"
              aria-label={formatLabel(editorLabel(L, 'levelFilterAria'))}
            >
              {(['all', ...levels] as const).map((choice) => (
                <Button
                  type="button"
                  key={choice}
                  variant={levelFilter === choice ? 'primary' : 'ghost'}
                  size="sm"
                  aria-pressed={levelFilter === choice}
                  data-level={choice}
                  onClick={() => setLevelChoice(choice)}
                >
                  {choice === 'all'
                    ? formatLabel(editorLabel(L, 'levelAll'))
                    : choice === 0
                      ? formatLabel(editorLabel(L, 'levelGround'))
                      : formatLabel(editorLabel(L, 'levelUpper'), { level: choice })}
                </Button>
              ))}
            </div>
          ) : null}
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
  const label = describeIssue(issue, options.labels.editor, options.locale, options.labels.issues);
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

/** The name of a section on the plan, above its block or, where there is no room, inside its top. */
function SectionName({
  box,
  boxes,
  fontSize,
  name,
}: {
  box: SectionBox;
  boxes: readonly SectionBox[];
  fontSize: number;
  name: string;
}) {
  const place = sectionLabelPlacement(box, boxes, fontSize);
  return (
    <text
      x={(box.minX + box.maxX) / 2}
      y={place.y}
      textAnchor="middle"
      data-inside={place.inside || undefined}
      style={{ fontSize: `${fontSize}px` }}
    >
      {name}
    </text>
  );
}

/**
 * Whether a section's block touches another block of its band (no aisle between them).
 * @param box The section's block.
 * @param boxes The blocks of its band.
 * @returns True when a neighbour starts where this block ends, or ends where it starts.
 */
export function touchesNeighbour(box: SectionBox, boxes: readonly SectionBox[]): boolean {
  return boxes.some(
    (other) =>
      other !== box &&
      (Math.abs(other.minX - box.maxX) < 0.005 || Math.abs(other.maxX - box.minX) < 0.005),
  );
}

/**
 * Whether a floor block lies under one of the upper-level blocks (a balcony over its rows).
 * @param box A block of the ground floor.
 * @param upper Blocks of the upper levels.
 * @returns True when the plan footprints overlap.
 */
export function coveredByUpper(box: SectionBox, upper: readonly SectionBox[]): boolean {
  return upper.some(
    (other) =>
      other.minX < box.maxX &&
      other.maxX > box.minX &&
      other.minZ < box.maxZ &&
      other.maxZ > box.minZ,
  );
}
