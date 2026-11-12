import { useMemo } from 'react';
import { computeViewForSeat, type Seat } from '@cinema-hall/core';
import { formatLabel } from '../labels/labels.js';
import { partClass } from '../provider/provider.js';
import { buildMapGeometry } from '../seat-map/geometry.js';
import {
  ActionLabel,
  continueLabel,
  holdTime,
  messageText,
  violationTexts,
  withPrice,
} from './Footer.js';
import type { PickerModel } from './use-picker-model.js';

/**
 * Content of the sheet and of the desktop details panel: zone chip, seat title, type and price,
 * minimap (mobile), the three metrics, the actions, the hold countdown and messages.
 * @param props - Props.
 * @param props.model - The picker model.
 * @param props.peekRef - Receives the compact top, which sets the sheet peek height.
 * @returns The details tree.
 * @example
 * ```tsx
 * <SeatDetails model={model} peekRef={setPeekEl} />
 * ```
 */
export function SeatDetails(props: {
  peekRef?: (el: HTMLElement | null) => void;
  model: PickerModel;
}) {
  const { peekRef, model } = props;
  const { options, layout } = model;
  const labels = options.labels.picker;
  const { Button, Chip, Card } = options.slots;
  const key = model.desktop ? model.previewKey : model.seatKey;
  const seat: Seat | undefined = key !== null ? model.seatByKey.get(key) : undefined;
  const geometry = useMemo(() => buildMapGeometry(layout), [layout]);
  const numbers = useMemo(
    () => new Intl.NumberFormat(options.locale, { maximumFractionDigits: 1 }),
    [options.locale],
  );
  if (!seat)
    return (
      <>
        <p>{formatLabel(labels.chooseSeat)}</p>
        <div data-chk="sheet-actions">
          <Button variant="secondary" disabled>
            {formatLabel(labels.preview)}
          </Button>
          <Button variant="primary" disabled>
            {formatLabel(labels.continue)}
          </Button>
        </div>
      </>
    );

  const metrics = computeViewForSeat(layout, seat);
  const zoneLabel = labels.zones[metrics.zone.id];
  const zoneText = zoneLabel ? formatLabel(zoneLabel) : metrics.zone.label;
  const typeLabel = layout.seatTypes[seat.seatTypeId]?.label ?? seat.seatTypeId;
  const multiple = model.selectionMode.mode === 'multiple';
  const count = model.selected.length;
  const title = formatLabel(labels.rowSeat, {
    row: seat.row,
    number: seat.number,
    label: seat.label,
  });
  const offset = metrics.lateralOffset;
  const offsetText =
    offset < -0.05
      ? formatLabel(labels.leftOfCentre)
      : offset > 0.05
        ? formatLabel(labels.rightOfCentre)
        : formatLabel(labels.centre);
  const message = messageText(
    model.state.message,
    (key) => model.seatByKey.get(key)?.label ?? key,
    labels,
  );
  const violations = violationTexts(model.state.violations, labels);
  const booking = model.state.status === 'booking';
  const price = model.priceOf(seat.key);
  // Booking always concerns the accepted selection and quotes its whole total. A seat that is only
  // viewed (not in the selection, e.g. the host refused it) is offered for selection instead.
  const inSelection = model.selected.includes(seat.key);
  const priced = model.total !== null;
  const totalText = model.format(model.total);
  const previewing = model.desktop && model.target !== 'view';
  const hint = count > 0 && !priced ? formatLabel(labels.priceMissing) : null;
  // On a narrow root the price stays on the line above; the button keeps just its verb.
  const buttonPrice = model.narrow ? '' : totalText;
  const bookLabel = model.booked
    ? formatLabel(labels.booked)
    : previewing
      ? continueLabel(labels, buttonPrice)
      : withPrice(formatLabel(labels.book, { price: buttonPrice }), buttonPrice);

  const actions = (
    <div data-chk="sheet-actions">
      <Button
        variant="secondary"
        disabled={model.inert || booking}
        onClick={previewing ? model.actions.continueToView : model.actions.backToMap}
      >
        <ActionLabel>{formatLabel(previewing ? labels.preview : labels.changeSeat)}</ActionLabel>
      </Button>
      {inSelection ? (
        <Button
          variant={model.desktop ? 'primary' : 'inverse'}
          loading={booking}
          disabled={model.inert || booking || count === 0 || model.booked || !priced}
          onClick={model.actions.book}
        >
          <ActionLabel>{bookLabel}</ActionLabel>
        </Button>
      ) : (
        <Button
          variant={model.desktop ? 'primary' : 'inverse'}
          disabled={model.inert || booking}
          onClick={() => model.actions.select(seat.key)}
        >
          <ActionLabel>{formatLabel(labels.selectSeat)}</ActionLabel>
        </Button>
      )}
    </div>
  );

  return (
    <>
      <div data-chk="sheet-compact" ref={peekRef}>
        <div data-chk="sheet-top">
          <Chip tone="accent">{zoneText}</Chip>
        </div>
        <div data-chk="sheet-title">{title}</div>
        <div data-chk="sheet-sub">
          {typeLabel}
          {price !== null ? ` · ${model.format(price)}` : ''}
        </div>
        {multiple && count > 0 ? (
          <div data-chk="sheet-selection">
            {formatLabel(labels.seatsSelected, { count })}
            {priced ? ` · ${formatLabel(labels.total)} · ${totalText}` : ''}
          </div>
        ) : null}
        {hint ? <div data-chk="price-hint">{hint}</div> : null}
        {model.desktop ? null : actions}
      </div>
      {model.desktop ? null : (
        <Minimap
          geometry={geometry}
          seatKey={seat.key}
          selected={model.selected}
          label={formatLabel(labels.mapAria)}
          className={partClass(options, 'minimap')}
        />
      )}
      <div data-chk="metrics">
        <Card className={partClass(options, 'metric')}>
          <span data-chk="metric-value">
            {formatLabel(labels.metres, { value: numbers.format(metrics.distance) })}
          </span>
          <span data-chk="metric-label">{formatLabel(labels.toScreen)}</span>
        </Card>
        <Card className={partClass(options, 'metric')}>
          <span data-chk="metric-value">
            {formatLabel(labels.degrees, { value: Math.round(metrics.fovDeg) })}
          </span>
          <span data-chk="metric-label">{formatLabel(labels.fieldOfView)}</span>
        </Card>
        <Card className={partClass(options, 'metric')}>
          <span data-chk="metric-value">
            {formatLabel(labels.metres, { value: numbers.format(Math.abs(offset)) })}
          </span>
          <span data-chk="metric-label">{offsetText}</span>
        </Card>
      </div>
      {model.desktop ? actions : null}
      {model.holdExpiresAt ? (
        <div data-chk="hold" role="status">
          {formatLabel(labels.holdExpires, {
            time: holdTime(model.holdExpiresAt, model.holdNowMs || Date.now(), model.holdSkewMs),
          })}
        </div>
      ) : null}
      {message || violations.length > 0 ? (
        <div role="alert" data-chk="message">
          {message ?? violations.join(' ')}
        </div>
      ) : null}
    </>
  );
}

function Minimap({
  geometry,
  seatKey,
  selected,
  label,
  className,
}: {
  geometry: ReturnType<typeof buildMapGeometry>;
  seatKey: string;
  selected: readonly string[];
  label: string;
  className?: string;
}) {
  const { viewBox, bounds, screen } = geometry;
  const dots = selected
    .map((key) => geometry.byKey.get(key))
    .filter((cell): cell is NonNullable<typeof cell> => cell !== undefined);
  const current = geometry.byKey.get(seatKey);
  return (
    <svg
      data-chk="minimap"
      role="img"
      aria-label={label}
      className={className}
      viewBox={`${bounds.minX} ${viewBox.y} ${bounds.maxX - bounds.minX} ${viewBox.height}`}
    >
      <path d={screen.path} />
      {geometry.seats.map((cell) => (
        <rect
          key={cell.key}
          x={cell.cx - cell.w / 2}
          y={cell.cy - cell.h / 2}
          width={cell.w}
          height={cell.h}
        />
      ))}
      {dots.map((cell) => (
        <circle key={cell.key} cx={cell.cx} cy={cell.cy} r={cell.w * 0.45} data-chk="minimap-dot" />
      ))}
      {current ? (
        <circle cx={current.cx} cy={current.cy} r={current.w * 0.6} data-chk="minimap-current" />
      ) : null}
    </svg>
  );
}
