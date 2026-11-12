import type { EditorLabels } from './editor-labels.js';
import { editorLabelsEn } from './editor-labels.js';

/**
 * A label is a template with `{placeholders}` or a function of the same params.
 * Functions allow any word order and plural rules; they cannot cross the Server→Client boundary.
 */
export type Label = string | ((params: Record<string, string | number>) => string);

/**
 * Fills a label. Each `{name}` placeholder of a template is replaced by the matching value in
 * `params`. A placeholder without a value stays as it is. A function label is called with `params`
 * and returns the text itself.
 *
 * @example
 * ```ts
 * formatLabel('View from {label}', { label: 'C5' }); // 'View from C5'
 * ```
 */
export function formatLabel(label: Label, params: Record<string, string | number> = {}): string {
  if (typeof label === 'function') return label(params);
  return label.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  );
}

/**
 * Texts of the seat picker and the seat view, by key. Override any key through the `labels` option
 * of `CinemaHallOptions`.
 */
export interface PickerLabels {
  screen: Label;
  /** Neutral sign shown after prices (no currency): `450,00 ¤`. Set `''` for numbers only. */
  priceSign: string;
  loading: Label;
  chooseSeat: Label;
  continue: Label;
  /** Opens the seat view without booking. */
  preview: Label;
  /** Request to select the seat shown in the details (when it is not in the accepted selection). */
  selectSeat: Label;
  /** Shown instead of a price when a selected seat has none; booking is not offered then. */
  priceMissing: Label;
  status: { available: Label; taken: Label; held: Label; blocked: Label; selected: Label };
  /** `{row}`, `{number}`, `{label}` */
  rowSeat: Label;
  rowSeatShort: Label;
  /**
   * Screen reader text of a seat: `{label}`, `{row}`, `{number}`, `{type}`, `{price}`, `{status}`
   */
  seatAria: Label;
  mapAria: Label;
  /** Accessible name of the sheet's drag handle. */
  dragHandle: Label;
  /** `{label}` */
  viewFrom: Label;
  back: Label;
  resetLook: Label;
  viewSeat: Label;
  changeSeat: Label;
  /** `{price}` */
  book: Label;
  booking: Label;
  total: Label;
  /** `{count}` */
  seatsSelected: Label;
  toScreen: Label;
  fieldOfView: Label;
  leftOfCentre: Label;
  rightOfCentre: Label;
  centre: Label;
  /** `{time}` mm:ss */
  holdExpires: Label;
  /** `{seats}` */
  conflict: Label;
  priceChanged: Label;
  closed: Label;
  error: Label;
  /** `{seats}` */
  selectionLost: Label;
  /** `{max}` */
  maxSeats: Label;
  webglUnavailable: Label;
  /** {value} in metres. */
  metres: Label;
  /** {value} in degrees. */
  degrees: Label;
  /** Book button text once the seats are booked. */
  booked: Label;
  /** Zone names by zone id; falls back to the zone label from the hall config. */
  zones: Record<string, Label>;
  /** Selection rule messages by violation code (`noSingleGap`, `sameRow`, …). */
  violations: Record<string, Label>;
}

/**
 * All texts of the library, grouped by area. Built-in English values are available from `labels`.
 */
export interface Labels {
  /** Texts of the seat picker and the seat view. */
  picker: PickerLabels;
  /** Texts of the hall constructor. */
  editor: EditorLabels;
}

const pickerEn: PickerLabels = {
  screen: 'SCREEN',
  priceSign: '¤',
  loading: 'Loading seats…',
  chooseSeat: 'Choose your seat',
  continue: 'Continue',
  preview: 'Preview',
  selectSeat: 'Select this seat',
  priceMissing: 'Price not set',
  status: {
    available: 'Available',
    taken: 'Taken',
    held: 'On hold',
    blocked: 'Unavailable',
    selected: 'Selected',
  },
  rowSeat: 'Row {row}, Seat {number}',
  rowSeatShort: 'Row {row} · Seat {number}',
  seatAria: '{label}, {type}, {price}, {status}',
  mapAria: 'Seat map',
  dragHandle: 'Drag to resize',
  viewFrom: 'View from {label}',
  back: 'Back',
  resetLook: 'Look at the screen',
  viewSeat: 'View from seat',
  changeSeat: 'Change seat',
  book: 'Book · {price}',
  booking: 'Booking…',
  total: 'Total',
  /**
   * Text for the number of selected seats, read from `count`. English uses "seat" for one and
   * "seats" otherwise.
   */
  seatsSelected: (p) => (Number(p.count) === 1 ? '1 seat' : `${p.count} seats`),
  toScreen: 'to screen',
  fieldOfView: 'field of view',
  leftOfCentre: 'left of centre',
  rightOfCentre: 'right of centre',
  centre: 'centre',
  holdExpires: 'Held for {time}',
  conflict: 'Sorry, {seats} has just been taken',
  priceChanged: 'Prices have changed. Please check and try again.',
  closed: 'Sales for this session are closed',
  error: 'Something went wrong. Please try again.',
  selectionLost: '{seats} is no longer available',
  maxSeats: 'You can select up to {max} seats',
  webglUnavailable: '3D view is not available on this device',
  metres: '{value} m',
  degrees: '{value}°',
  booked: 'Booked',
  zones: {},
  violations: {
    noSingleGap: 'Please don’t leave a single empty seat',
    sameRow: 'Please choose seats in one row',
    adjacent: 'Please choose seats next to each other',
    max: 'You can select up to {max} seats',
  },
};

/**
 * Built-in English labels. The `ru` property remains as a compatibility alias for existing callers.
 */
export const labels: { en: Labels; ru: Labels } = {
  en: { picker: pickerEn, editor: editorLabelsEn },
  ru: { picker: pickerEn, editor: editorLabelsEn },
};

/**
 * A `T` with every property optional, at every depth. Functions are kept whole. Used for label
 * overrides.
 */
export type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** Deep merge for plain label/option objects (arrays and functions are replaced, not merged). */
export function deepMerge<T>(base: T, ...overrides: (DeepPartial<T> | undefined)[]): T {
  let out = base;
  for (const override of overrides) {
    if (!override) continue;
    out = mergeTwo(out, override);
  }
  return out;
}

function mergeTwo<T>(base: T, override: DeepPartial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(override)) return (override ?? base) as T;
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const current = result[key];
    result[key] = isPlainObject(current) && isPlainObject(value) ? mergeTwo(current, value) : value;
  }
  return result as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
