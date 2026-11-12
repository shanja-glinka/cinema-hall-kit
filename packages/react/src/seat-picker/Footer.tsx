import type { ReactNode } from 'react';
import type { SelectionViolation, SeatKey } from '@cinema-hall/core';
import { formatLabel, type PickerLabels } from '../labels/labels.js';
import { partClass } from '../provider/provider.js';
import type { PickerMessage } from './store.js';
import { useRequiredModel } from './use-seat-picker.js';

/**
 * Text of a picker message, or `null` when there is none.
 * @param message - The message.
 * @param seatLabel - Maps a seat key to its label.
 * @param labels - Picker labels.
 * @returns The text.
 */
export function messageText(
  message: PickerMessage | null,
  seatLabel: (key: SeatKey) => string,
  labels: PickerLabels,
): string | null {
  if (!message) return null;
  switch (message.kind) {
    case 'conflict':
      return formatLabel(labels.conflict, { seats: message.keys.map(seatLabel).join(', ') });
    case 'selectionLost':
      return formatLabel(labels.selectionLost, { seats: message.keys.map(seatLabel).join(', ') });
    case 'maxSeats':
      return formatLabel(labels.maxSeats, { max: message.max });
    case 'priceChanged':
      return formatLabel(labels.priceChanged);
    case 'closed':
      return formatLabel(labels.closed);
    case 'error':
      return formatLabel(labels.error);
  }
}

/**
 * Texts for selection rule violations (`labels.picker.violations[code]`).
 * @param violations - Violations from `validateSelection`.
 * @param labels - Picker labels.
 * @returns One text per violation.
 */
export function violationTexts(
  violations: readonly SelectionViolation[],
  labels: PickerLabels,
): string[] {
  return violations.map((violation) => {
    const label = labels.violations[violation.code];
    return label ? formatLabel(label, violation.params ?? {}) : formatLabel(labels.error);
  });
}

/**
 * Time left on a hold, `mm:ss`.
 * @param expiresAt - ISO expiry.
 * @param nowMs - Local clock, in milliseconds.
 * @param skewMs - Server time minus local time.
 * @returns The countdown text.
 */
export function holdTime(expiresAt: string, nowMs: number, skewMs: number): string {
  const left = Math.max(0, Math.floor((Date.parse(expiresAt) - (nowMs + skewMs)) / 1000));
  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Map-stage bar: the selection summary, messages, Preview and direct booking. Hidden on the view
 * stage and in the desktop layout (the details panel carries the same actions).
 * @returns The footer, or `null`.
 * @example
 * ```tsx
 * <SeatPickerFooter />
 * ```
 */
export function SeatPickerFooter() {
  const model = useRequiredModel('SeatPickerFooter');
  const { options, state } = model;
  if (model.target === 'view' || model.desktop) return null;
  const labels = options.labels.picker;
  const { Button } = options.slots;
  const seatLabel = (key: SeatKey) => model.seatByKey.get(key)?.label ?? key;
  const count = model.selected.length;
  const only = count === 1 ? model.seatByKey.get(model.selected[0] ?? '') : undefined;

  // Line 1: "Row E · Seat 14 · 450,00 ¤" or "2 seats · 900,00 ¤". No price, no separator.
  const priced = model.total !== null;
  let summary: ReactNode;
  if (model.inert) {
    summary = <span>{formatLabel(labels.loading)}</span>;
  } else if (count === 0) {
    summary = <span>{formatLabel(labels.chooseSeat)}</span>;
  } else {
    const head = only
      ? formatLabel(labels.rowSeatShort, { row: only.row, number: only.number, label: only.label })
      : formatLabel(labels.seatsSelected, { count });
    summary = (
      <>
        <span>{head}</span>
        {priced ? <span aria-hidden="true">·</span> : null}
        {priced ? <strong>{model.format(model.total)}</strong> : null}
      </>
    );
  }

  const message =
    messageText(state.message, seatLabel, labels) ??
    violationTexts(state.violations, labels).join(' ') ??
    null;
  const canPreview = count > 0 && !model.inert && state.status !== 'booking';
  // Booking quotes the whole accepted selection, so a missing price anywhere blocks it.
  const canContinue = canPreview && priced;
  const hint = count > 0 && !model.inert && !priced ? formatLabel(labels.priceMissing) : null;

  return (
    <footer data-chk="footer" className={partClass(options, 'footer')}>
      <div data-chk="footer-summary">
        <div data-chk="footer-line">{summary}</div>
        {hint ? <div data-chk="price-hint">{hint}</div> : null}
        {message ? (
          <div role="alert" data-chk="message">
            {message}
          </div>
        ) : null}
      </div>
      <div data-chk="footer-actions">
        <Button variant="secondary" disabled={!canPreview} onClick={model.actions.continueToView}>
          <ActionLabel>{formatLabel(labels.preview)}</ActionLabel>
        </Button>
        <Button
          variant="primary"
          loading={state.status === 'booking'}
          disabled={!canContinue || model.booked}
          onClick={model.actions.book}
        >
          <ActionLabel>
            {model.booked
              ? formatLabel(labels.booked)
              : continueLabel(labels, model.narrow ? '' : model.format(model.total))}
          </ActionLabel>
        </Button>
      </div>
    </footer>
  );
}

/**
 * Keep custom Continue templates working while always showing the price of this selection. Without
 * a price the label has no price and no dangling separator.
 * @param labels - Picker labels.
 * @param price - The formatted price, or `''` when the selection has no complete price.
 * @returns The button text.
 */
export function continueLabel(labels: PickerLabels, price: string): string {
  return withPrice(formatLabel(labels.continue, { price }), price);
}

/**
 * Makes a `{price}` label read well with and without the price: an empty price drops the separator
 * left behind (`Book · ` becomes `Book`); a template without `{price}` gets ` · price` appended.
 * @param text - The label formatted with the `price` param.
 * @param price - The formatted price, or `''`.
 * @returns The text.
 */
export function withPrice(text: string, price: string): string {
  if (!price) return text.replace(/\s*[·•:\-–—]\s*$/u, '').trim();
  return text.includes(price) ? text : `${text} · ${price}`;
}

/**
 * Label of an action button: one line, ellipsis as the last resort.
 * @param props - Props.
 * @param props.children - The label text.
 * @returns The label element.
 */
export function ActionLabel(props: { children: ReactNode }) {
  return <span data-chk="action-label">{props.children}</span>;
}
