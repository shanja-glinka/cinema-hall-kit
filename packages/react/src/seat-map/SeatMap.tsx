import {
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type ComponentType,
  type KeyboardEvent,
} from 'react';
import type { HallLayout, Price, Seat, SeatKey, SeatStatus } from '@cinema-hall/core';
import {
  formatLabel,
  labels as builtInLabels,
  pickerLabel,
  type PickerLabels,
} from '../labels/labels.js';
import { useResolvedOptions, type ClassNames } from '../provider/provider.js';
import type { SeatSlotProps } from '../slots/slots.js';
import {
  buildMapGeometry,
  groupRows,
  nearestSeat,
  rowEdges,
  SEAT_GAP_RATIO,
  type MapGeometry,
  type NavDirection,
  type SeatCell,
} from './geometry.js';

/** Props of `SeatMap`. */
export interface SeatMapProps {
  layout: HallLayout;
  status: (key: SeatKey) => SeatStatus;
  /** Price of a seat for labels and the seat slot; `null` when unknown. */
  priceOf?: (key: SeatKey) => Price | null;
  formatPrice?: (price: Price) => string;
  selected: readonly SeatKey[];
  /** Roving focus target. Falls back to the first seat. */
  focusKey: SeatKey | null;
  /** Occupancy not loaded yet: the map is visible, seats are inert. */
  inert?: boolean;
  /** Fill colour per seat type id (theme override); defaults to the layout colour. */
  typeColors?: Record<string, string>;
  labels: PickerLabels;
  /** Extra classes per part (the library classes stay). */
  classNames?: ClassNames;
  /** Replaces the default seat glyph. */
  SeatSlot?: ComponentType<SeatSlotProps>;
  onFocusSeat: (key: SeatKey) => void;
  onActivate: (key: SeatKey) => void;
  showLegend?: boolean;
  /**
   * Seats this viewer has reserved (their own hold or purchase). They are drawn as "yours" with a
   * check mark, not as someone else's hold.
   */
  isMine?: (key: SeatKey) => boolean;
  /**
   * Seats that can be picked although their status is not `available`: the viewer's own active
   * hold, so a seat deselected from it can be selected again. Seats someone else holds, bought
   * seats and unavailable seats should return `false`. Default: none.
   */
  isReselectable?: (key: SeatKey) => boolean;
  /**
   * Smallest width of a seat's tap area in CSS pixels on touch screens (and in the mobile picker).
   * When the map would draw seats smaller, it keeps this size and scrolls sideways instead.
   * Default `32`; `0` lets the map shrink to its container.
   */
  minSeatSize?: number;
  className?: string;
  style?: CSSProperties;
}

const ARROWS: Record<string, NavDirection> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

const statusMineFallback = builtInLabels.en.picker.status.mine ?? 'Your seats';

/** Default smallest seat tap area on touch screens, CSS pixels. */
const DEFAULT_MIN_SEAT_SIZE = 32;

/** What a seat glyph shows: the seat state as the viewer should read it. */
type GlyphKind = 'available' | 'selected' | 'mine' | 'held' | 'taken' | 'blocked';

/**
 * State marks drawn over the seat body, so states differ by shape and not only by colour:
 * taken and unavailable seats are crossed out, someone else's hold has a dash, the viewer's own
 * reservation has a check mark.
 */
function GlyphMark({ kind, size }: { kind: GlyphKind; size: number }) {
  const a = size * 0.22;
  switch (kind) {
    case 'taken':
    case 'blocked':
      return (
        <path data-chk="seat-mark" d={`M ${-a} ${-a} L ${a} ${a} M ${a} ${-a} L ${-a} ${a}`} />
      );
    case 'held':
      return <path data-chk="seat-mark" d={`M ${-a} 0 L ${a} 0`} />;
    case 'mine':
      return (
        <path
          data-chk="seat-mark"
          d={`M ${-a} ${a * 0.05} L ${-a * 0.3} ${a * 0.7} L ${a} ${-a * 0.65}`}
        />
      );
    default:
      return null;
  }
}

function glyphKind(status: SeatStatus, selected: boolean, mine: boolean): GlyphKind {
  if (selected) return 'selected';
  if (mine) return 'mine';
  return status;
}

/** A legend swatch drawn with the same glyph as the seats on the map. */
function Swatch(props: { kind: GlyphKind; typeIndex?: number; colour?: string }) {
  const size = 20;
  return (
    <svg data-swatch="" viewBox="-12 -12 24 24" width="16" height="16" focusable="false">
      <g
        data-chk-glyph=""
        data-status={props.kind === 'mine' || props.kind === 'selected' ? 'held' : props.kind}
        data-mine={props.kind === 'mine' ? '' : undefined}
        data-selected={props.kind === 'selected' ? '' : undefined}
        data-seat-type-index={props.typeIndex}
        style={
          {
            ['--chk-_type' as string]: props.colour,
            ['--chk-_cell' as string]: `${size}px`,
          } as CSSProperties
        }
      >
        <rect x={-size / 2} y={-size / 2} width={size} height={size} />
        <GlyphMark kind={props.kind} size={size} />
      </g>
    </svg>
  );
}

/**
 * The 2D seat map: an SVG grid. Seats are `gridcell`s with roving tabindex; arrows move to the
 * nearest seat in that direction, Home/End go to the row ends, Enter or Space picks the seat.
 * Prices read through `formatPrice` (plain units, no currency).
 * @param props - See `SeatMapProps`.
 * @returns The map and its legend.
 * @example
 * ```tsx
 * <SeatMap layout={layout} status={status} selected={selected} labels={labels} onActivate={pick} />
 * ```
 */
export function SeatMap(props: SeatMapProps) {
  const options = useResolvedOptions();
  const {
    layout,
    status,
    priceOf,
    formatPrice,
    selected,
    focusKey,
    inert = false,
    typeColors,
    labels,
    SeatSlot,
    classNames = {},
    isMine,
    isReselectable,
    minSeatSize = DEFAULT_MIN_SEAT_SIZE,
  } = props;
  const part = (name: keyof ClassNames, base?: string) =>
    [base, classNames[name]].filter(Boolean).join(' ') || undefined;
  const geometry = useMemo<MapGeometry>(() => buildMapGeometry(layout), [layout]);
  const seatByKey = useMemo(
    () => new Map<SeatKey, Seat>(layout.seats.map((seat) => [seat.key, seat])),
    [layout],
  );
  const rows = useMemo(() => groupRows(geometry), [geometry]);
  const rowMarks = useMemo(() => new Map(geometry.rows.map((row) => [row.index, row])), [geometry]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const cells = useRef(new Map<SeatKey, SVGGElement>());
  const pendingFocus = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // A map wider than its box (small seats kept at their tap size) opens on the centre of the hall.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const extra = el.scrollWidth - el.clientWidth;
    if (extra > 0) el.scrollLeft = extra / 2;
  }, [geometry]);

  // While the map scrolls sideways its own row letters scroll out of view: a rail of row letters,
  // laid over the left edge of the scroll box, stays in view instead. `rail` holds the drawn size
  // of one map unit in CSS pixels and the scroll box's place in the wrapper; null while the map
  // fits its box. The rail follows vertical scrolling through --chk-_rail-shift.
  const [rail, setRail] = useState<{ scale: number; top: number; height: number } | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const shift = () => {
      const svg = el.querySelector('svg');
      const node = railRef.current;
      if (!svg || !node) return;
      const offset = svg.getBoundingClientRect().top - el.getBoundingClientRect().top;
      node.style.setProperty('--chk-_rail-shift', `${offset}px`);
    };
    const measure = () => {
      const svg = el.querySelector('svg');
      const width = svg?.getBoundingClientRect().width ?? 0;
      const overflows = el.scrollWidth - el.clientWidth > 1;
      const next =
        overflows && width > 0
          ? { scale: width / geometry.viewBox.width, top: el.offsetTop, height: el.clientHeight }
          : null;
      setRail((current) =>
        current === next ||
        (current !== null &&
          next !== null &&
          Math.abs(current.scale - next.scale) < 1e-4 &&
          current.top === next.top &&
          current.height === next.height)
          ? current
          : next,
      );
      shift();
    };
    measure();
    el.addEventListener('scroll', shift, { passive: true });
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => {
        el.removeEventListener('scroll', shift);
        window.removeEventListener('resize', measure);
      };
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const svg = el.querySelector('svg');
    if (svg) observer.observe(svg);
    return () => {
      el.removeEventListener('scroll', shift);
      observer.disconnect();
    };
  }, [geometry]);
  // The rail is drawn after a measurement: give it its scroll offset at once.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const svg = el?.querySelector('svg');
    if (!el || !svg || !railRef.current) return;
    const offset = svg.getBoundingClientRect().top - el.getBoundingClientRect().top;
    railRef.current.style.setProperty('--chk-_rail-shift', `${offset}px`);
  }, [rail]);

  const firstKey = geometry.seats[0]?.key ?? null;
  const activeKey = focusKey !== null && geometry.byKey.has(focusKey) ? focusKey : firstKey;

  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    if (activeKey !== null) cells.current.get(activeKey)?.focus();
  }, [activeKey]);

  const pickable = useCallback(
    (key: SeatKey) =>
      !inert &&
      (selectedSet.has(key) || status(key) === 'available' || Boolean(isReselectable?.(key))),
    [inert, selectedSet, status, isReselectable],
  );

  const activate = (key: SeatKey) => {
    if (pickable(key)) props.onActivate(key);
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (activeKey === null) return;
    const direction = ARROWS[event.key];
    if (direction) {
      event.preventDefault();
      const next = nearestSeat(geometry, activeKey, direction);
      if (next !== null) {
        pendingFocus.current = true;
        props.onFocusSeat(next);
      }
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const edges = rowEdges(geometry, activeKey);
      const target = event.key === 'Home' ? edges.first : edges.last;
      if (target !== null && target !== activeKey) {
        pendingFocus.current = true;
        props.onFocusSeat(target);
      }
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate(activeKey);
    }
  };

  const { viewBox, screen } = geometry;
  const seatLabel = (
    cell: SeatCell,
    seat: Seat | undefined,
    st: SeatStatus,
    isSelected: boolean,
  ) => {
    const price = priceOf?.(cell.key) ?? null;
    const priceText = price !== null ? (formatPrice ?? options.formatPrice)(price) : '';
    const typeLabel = layout.seatTypes[cell.typeId]?.label ?? cell.typeId;
    return formatLabel(labels.seatAria, {
      label: seat?.label ?? cell.key,
      row: seat?.row ?? '',
      number: seat?.number ?? 0,
      type: typeLabel,
      price: priceText,
      status: formatLabel(
        isSelected
          ? labels.status.selected
          : isMine?.(cell.key)
            ? (labels.status.mine ?? statusMineFallback)
            : labels.status[st],
      ),
    });
  };

  const mapMinWidth =
    minSeatSize > 0 && geometry.minSeatWidth > 0
      ? (geometry.viewBox.width * minSeatSize) / geometry.minSeatWidth
      : 0;

  // Legend: the seat types that have seats, with their price (or the lowest one), then the states.
  const legendTypes = geometry.typeIds.flatMap((id, index) => {
    const typeSeats = geometry.seats.filter((cell) => cell.typeId === id);
    if (typeSeats.length === 0) return [];
    const prices = typeSeats
      .map((cell) => priceOf?.(cell.key) ?? null)
      .filter((price): price is Price => price !== null);
    const min = prices.length > 0 ? Math.min(...prices) : null;
    const varies = prices.some((price) => price !== min);
    const typeLabel = layout.seatTypes[id]?.label ?? id;
    const text =
      min === null
        ? typeLabel
        : formatLabel(pickerLabel(labels, varies ? 'legendTypePriceFrom' : 'legendTypePrice'), {
            type: typeLabel,
            price: (formatPrice ?? options.formatPrice)(min),
          });
    return [{ id, index, text, colour: typeColors?.[id] ?? layout.seatTypes[id]?.color }];
  });
  let anyMine = false;
  let anyBlocked = false;
  if (props.showLegend !== false) {
    for (const cell of geometry.seats) {
      if (!anyMine && !selectedSet.has(cell.key) && isMine?.(cell.key)) anyMine = true;
      if (!anyBlocked && status(cell.key) === 'blocked') anyBlocked = true;
      if (anyMine && anyBlocked) break;
    }
  }
  const legendStates: { kind: GlyphKind; text: string }[] = [
    { kind: 'selected', text: formatLabel(labels.status.selected) },
    ...(anyMine
      ? [{ kind: 'mine' as const, text: formatLabel(labels.status.mine ?? statusMineFallback) }]
      : []),
    { kind: 'held', text: formatLabel(labels.status.held) },
    { kind: 'taken', text: formatLabel(labels.status.taken) },
    ...(anyBlocked ? [{ kind: 'blocked' as const, text: formatLabel(labels.status.blocked) }] : []),
  ];

  // Each row's seats, as `role=row` groups; row positions count from 1 within their grid.
  const renderRows = (list: ReturnType<typeof groupRows>) =>
    list.map((row, position) => {
      const mark = rowMarks.get(row.rowIndex);
      return (
        <g key={row.rowIndex} role="row" aria-rowindex={position + 1}>
          {mark ? (
            <text
              data-chk="row-label"
              className={part('rowLabel')}
              x={mark.x}
              y={mark.y}
              textAnchor="middle"
              dominantBaseline="central"
              aria-hidden="true"
            >
              {row.label}
            </text>
          ) : null}
          {row.seats.map((cell) => {
            const seat = seatByKey.get(cell.key);
            const st = status(cell.key);
            const isSelected = selectedSet.has(cell.key);
            const mine = !isSelected && Boolean(isMine?.(cell.key));
            const disabled = !pickable(cell.key);
            const focused = cell.key === activeKey;
            const colour = typeColors?.[cell.typeId] ?? cell.color;
            const r = Math.min(cell.w, cell.h) * 0.18;
            // The tap area is the whole seat footprint, not just the drawn seat.
            const hitW = cell.w / (1 - SEAT_GAP_RATIO);
            const hitH = cell.h / (1 - SEAT_GAP_RATIO);
            const glyphProps = {
              seat: seat as Seat,
              status: st,
              selected: isSelected,
              focused,
              seatTypeIndex: cell.typeIndex,
              price: priceOf?.(cell.key) ?? null,
              width: cell.w,
              height: cell.h,
            };
            return (
              <g
                key={cell.key}
                ref={(node) => {
                  if (node) cells.current.set(cell.key, node);
                  else cells.current.delete(cell.key);
                }}
                role="gridcell"
                tabIndex={focused ? 0 : -1}
                data-chk="seat"
                data-chk-glyph=""
                className={part('seat')}
                data-key={cell.key}
                data-status={st}
                data-selected={isSelected ? '' : undefined}
                data-mine={mine ? '' : undefined}
                data-focused={focused ? '' : undefined}
                data-seat-type={cell.typeId}
                data-seat-type-index={cell.typeIndex}
                aria-selected={isSelected}
                aria-disabled={disabled || undefined}
                aria-label={seatLabel(cell, seat, st, isSelected)}
                transform={`translate(${cell.cx} ${cell.cy})`}
                style={
                  {
                    ['--chk-_type' as string]: colour,
                    ['--chk-_cell' as string]: String(Math.min(cell.w, cell.h)) + 'px',
                  } as CSSProperties
                }
                onFocus={() => props.onFocusSeat(cell.key)}
                onClick={() => {
                  props.onFocusSeat(cell.key);
                  activate(cell.key);
                }}
              >
                <path
                  data-chk="seat-hit"
                  d={`M ${-hitW / 2} ${-hitH / 2} h ${hitW} v ${hitH} h ${-hitW} Z`}
                />
                {SeatSlot && seat ? (
                  <SeatSlot {...glyphProps} />
                ) : (
                  <>
                    <rect x={-cell.w / 2} y={-cell.h / 2} width={cell.w} height={cell.h} rx={r} />
                    <GlyphMark
                      kind={glyphKind(st, isSelected, mine)}
                      size={Math.min(cell.w, cell.h)}
                    />
                    {isSelected ? (
                      <text
                        x={0}
                        y={0}
                        textAnchor="middle"
                        dominantBaseline="central"
                        aria-hidden="true"
                      >
                        {seat?.number ?? ''}
                      </text>
                    ) : null}
                  </>
                )}
              </g>
            );
          })}
        </g>
      );
    });

  // A hall with balconies: one grid per level, the ground floor first under the screen, then each
  // upper level under its heading.
  const upperLevels = geometry.levels.filter((level) => level.level > 0).length;
  const blocks = geometry.levels.map((level) => {
    const name =
      level.bandLabels.length > 0
        ? level.bandLabels.join(' · ')
        : level.level === 0
          ? formatLabel(pickerLabel(labels, 'levelGround'))
          : upperLevels === 1
            ? formatLabel(pickerLabel(labels, 'levelBalcony'))
            : formatLabel(pickerLabel(labels, 'levelUpper'), { level: level.level });
    return { level, name, rows: rows.filter((row) => row.seats[0]?.level === level.level) };
  });
  const multiLevel = blocks.length > 1;

  return (
    <div data-chk="map-wrapper" className={props.className} style={props.style}>
      <div
        data-chk="map-scroll"
        ref={scrollRef}
        data-rail={rail !== null ? '' : undefined}
        style={
          { ['--chk-_map-min-width' as string]: `${Math.round(mapMinWidth)}px` } as CSSProperties
        }
      >
        <svg
          role={multiLevel ? 'group' : 'grid'}
          aria-label={formatLabel(labels.mapAria)}
          aria-rowcount={multiLevel ? undefined : rows.length}
          aria-colcount={
            multiLevel ? undefined : Math.max(0, ...rows.map((row) => row.seats.length))
          }
          aria-busy={inert || undefined}
          data-levels={multiLevel ? blocks.length : undefined}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          data-chk="map"
          tabIndex={-1}
          onKeyDown={onKeyDown}
          focusable="false"
        >
          <g data-chk="screen" aria-hidden="true" className={part('mapScreen')}>
            <path data-chk="screen-glow" d={screen.path} />
            <path d={screen.path} />
            <text x={screen.cx} y={screen.labelY} textAnchor="middle">
              {formatLabel(labels.screen)}
            </text>
          </g>
          {geometry.dividers.length > 0 ? (
            <g data-chk="section-dividers" aria-hidden="true">
              {geometry.dividers.map((line) => (
                <line
                  key={`${line.rowIndex}:${line.x}`}
                  data-chk="section-divider"
                  x1={line.x}
                  x2={line.x}
                  y1={line.y - line.h / 2}
                  y2={line.y + line.h / 2}
                />
              ))}
            </g>
          ) : null}
          {multiLevel
            ? blocks.map((block) => (
                <g
                  key={block.level.level}
                  role="grid"
                  data-chk="map-level"
                  data-level={block.level.level}
                  aria-label={formatLabel(pickerLabel(labels, 'levelGridAria'), {
                    map: formatLabel(labels.mapAria),
                    level: block.name,
                  })}
                  aria-rowcount={block.rows.length}
                  aria-colcount={Math.max(0, ...block.rows.map((row) => row.seats.length))}
                  aria-busy={inert || undefined}
                >
                  {block.level.headingY !== null ? (
                    <text
                      data-chk="map-level-heading"
                      x={(geometry.bounds.minX + geometry.bounds.maxX) / 2}
                      y={block.level.headingY}
                      textAnchor="middle"
                      aria-hidden="true"
                    >
                      {block.name}
                    </text>
                  ) : null}
                  {renderRows(block.rows)}
                </g>
              ))
            : renderRows(rows)}
        </svg>
      </div>
      {rail !== null ? (
        <div
          data-chk="row-rail"
          ref={railRef}
          aria-hidden="true"
          style={{ top: `${rail.top}px`, height: `${rail.height}px` }}
        >
          {rows.map((row) => {
            const mark = rowMarks.get(row.rowIndex);
            if (!mark) return null;
            return (
              <span
                key={row.rowIndex}
                data-chk="row-rail-label"
                className={part('rowLabel')}
                style={{
                  top: `calc(var(--chk-_rail-shift, 0px) + ${(mark.y - viewBox.y) * rail.scale}px)`,
                }}
              >
                {row.label}
              </span>
            );
          })}
        </div>
      ) : null}
      {props.showLegend === false ? null : (
        <div data-chk="legend" aria-hidden="true" className={part('legend')}>
          {legendTypes.length > 0 ? (
            <div data-chk="legend-group" data-group="types">
              <span data-chk="legend-title">{formatLabel(pickerLabel(labels, 'legendTypes'))}</span>
              <ul>
                {legendTypes.map((type) => (
                  <li key={type.id} data-seat-type={type.id}>
                    <Swatch kind="available" typeIndex={type.index} colour={type.colour} />
                    {type.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div data-chk="legend-group" data-group="status">
            <span data-chk="legend-title">{formatLabel(pickerLabel(labels, 'legendStatus'))}</span>
            <ul>
              {legendStates.map((item) => (
                <li key={item.kind} data-status={item.kind}>
                  <Swatch kind={item.kind} />
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
