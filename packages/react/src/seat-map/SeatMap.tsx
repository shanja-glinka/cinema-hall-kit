import {
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type CSSProperties,
  type ComponentType,
  type KeyboardEvent,
} from 'react';
import type { HallLayout, Price, Seat, SeatKey, SeatStatus } from '@cinema-hall/core';
import { formatLabel, type PickerLabels } from '../labels/labels.js';
import { useResolvedOptions, type ClassNames } from '../provider/provider.js';
import type { SeatSlotProps } from '../slots/slots.js';
import {
  buildMapGeometry,
  groupRows,
  nearestSeat,
  rowEdges,
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
  className?: string;
  style?: CSSProperties;
}

const ARROWS: Record<string, NavDirection> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

const LEGEND_STATUSES: SeatStatus[] = ['available', 'taken', 'held'];

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

  const firstKey = geometry.seats[0]?.key ?? null;
  const activeKey = focusKey !== null && geometry.byKey.has(focusKey) ? focusKey : firstKey;

  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    if (activeKey !== null) cells.current.get(activeKey)?.focus();
  }, [activeKey]);

  const pickable = useCallback(
    (key: SeatKey) => !inert && (selectedSet.has(key) || status(key) === 'available'),
    [inert, selectedSet, status],
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
      status: formatLabel(isSelected ? labels.status.selected : labels.status[st]),
    });
  };

  return (
    <div data-chk="map-wrapper" className={props.className} style={props.style}>
      <svg
        role="grid"
        aria-label={formatLabel(labels.mapAria)}
        aria-rowcount={rows.length}
        aria-colcount={Math.max(0, ...rows.map((row) => row.seats.length))}
        aria-busy={inert || undefined}
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
        {rows.map((row) => {
          const mark = rowMarks.get(row.rowIndex);
          return (
            <g key={row.rowIndex} role="row" aria-rowindex={row.rowIndex + 1}>
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
                const disabled = inert || (!isSelected && st !== 'available');
                const focused = cell.key === activeKey;
                const colour = typeColors?.[cell.typeId] ?? cell.color;
                const r = Math.min(cell.w, cell.h) * 0.18;
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
                    className={part('seat')}
                    data-key={cell.key}
                    data-status={st}
                    data-selected={isSelected ? '' : undefined}
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
                    {SeatSlot && seat ? (
                      <SeatSlot {...glyphProps} />
                    ) : (
                      <>
                        <rect
                          x={-cell.w / 2}
                          y={-cell.h / 2}
                          width={cell.w}
                          height={cell.h}
                          rx={r}
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
        })}
      </svg>
      {props.showLegend === false ? null : (
        <ul data-chk="legend" aria-hidden="true" className={part('legend')}>
          {LEGEND_STATUSES.map((st) => (
            <li key={st} data-status={st}>
              <span data-swatch="" />
              {formatLabel(labels.status[st])}
            </li>
          ))}
          <li data-status="selected">
            <span data-swatch="" />
            {formatLabel(labels.status.selected)}
          </li>
          {geometry.typeIds.map((id, index) => (
            <li key={id} data-seat-type={id}>
              <span
                data-swatch=""
                data-seat-type-index={index}
                style={
                  {
                    ['--chk-_type' as string]: typeColors?.[id] ?? layout.seatTypes[id]?.color,
                  } as CSSProperties
                }
              />
              {layout.seatTypes[id]?.label ?? id}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
