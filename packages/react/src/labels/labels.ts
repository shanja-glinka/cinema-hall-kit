import { DEFAULT_VIEWING_ZONES, issueMessages, type IssueMessages } from '@cinema-hall/core';
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
  /**
   * Seat states. `mine` is a seat this viewer has reserved (their own hold or purchase); it is
   * optional so older full label objects keep compiling, and falls back to the English text.
   */
  status: {
    available: Label;
    taken: Label;
    held: Label;
    blocked: Label;
    selected: Label;
    mine?: Label;
  };
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
  /** Book button text once the seats are reserved (held) for this viewer. */
  booked: Label;
  /**
   * Explains the reservation countdown: what the viewer has to do before it ends. Shown only when
   * the host passes `onConfirm` (a reservation-only picker has no purchase step to point at).
   */
  holdHint?: Label;
  /** Shown when the reservation countdown has run out. */
  holdExpired?: Label;
  /** `{price}`: the purchase button shown on a reservation when the host passes `onConfirm`. */
  confirmPurchase?: Label;
  /** The purchase button while `onConfirm` runs. */
  confirming?: Label;
  /** The disabled button once the purchase is complete. */
  purchased?: Label;
  /** Status line once the purchase is complete and the host returned no ticket number. */
  purchaseDone?: Label;
  /** `{ticket}`: status line once the purchase is complete with a ticket number. */
  purchaseTicket?: Label;
  /**
   * `{tickets}`: status line when the selected seats were bought in several purchases; the ticket
   * numbers are joined with commas, oldest first.
   */
  purchaseTickets?: Label;
  /** Shown when `onConfirm` failed. */
  confirmError?: Label;
  /** Heading of the legend group that lists seat types and their prices (available seats). */
  legendTypes?: Label;
  /** `{type}`, `{price}`: a seat type in the legend. */
  legendTypePrice?: Label;
  /** `{type}`, `{price}`: a seat type whose seats have different prices; `{price}` is the lowest. */
  legendTypePriceFrom?: Label;
  /** Heading of the legend group that lists seat states. */
  legendStatus?: Label;
  /** Name of the ground-floor block of the map in a hall with balconies. */
  levelGround?: Label;
  /** Heading of the only upper level when its bands have no names. */
  levelBalcony?: Label;
  /** `{level}`: heading of an upper level when its bands have no names and there are several. */
  levelUpper?: Label;
  /** `{map}`, `{level}`: accessible name of one level's seat grid. */
  levelGridAria?: Label;
  /** Zone names by zone id; falls back to the zone label from the hall config. */
  zones: Record<string, Label>;
  /**
   * Names of the library's default viewing zones (`up-close`, `sweet-spot`, `full-picture`), used
   * when a hall keeps the default zone or its default English name. A zone renamed in the hall
   * config keeps its own name; `zones` overrides both.
   */
  defaultZones?: Record<string, Label>;
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
  /**
   * Texts of validation issues in the hall constructor, by issue code (the catalog that
   * `formatIssue` from `@cinema-hall/core` takes as `messages`). Codes not set here use the
   * built-in English texts. `labels.en` (and its alias `labels.ru`) uses `issueMessages.en`. Optional, so label objects written for an older version keep compiling.
   */
  issues?: IssueMessages;
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
    mine: 'Your seats',
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
  holdExpires: 'Seats reserved for {time}',
  conflict: 'Sorry, {seats} has just been taken',
  priceChanged: 'Prices have changed. Please check and try again.',
  closed: 'Sales for this session are closed',
  error: 'Something went wrong. Please try again.',
  selectionLost: '{seats} is no longer available',
  maxSeats: 'You can select up to {max} seats',
  webglUnavailable: '3D view is not available on this device',
  metres: '{value} m',
  degrees: '{value}°',
  booked: 'Seats reserved',
  holdHint: 'Complete the purchase before the timer ends.',
  holdExpired: 'Your reservation has expired. Please choose your seats again.',
  confirmPurchase: 'Confirm purchase · {price}',
  confirming: 'Confirming…',
  purchased: 'Purchased',
  purchaseDone: 'Purchase complete',
  purchaseTicket: 'Purchased · ticket № {ticket}',
  purchaseTickets: 'Purchased · tickets № {tickets}',
  confirmError: 'The purchase could not be completed. Please try again.',
  legendTypes: 'Available seats',
  legendTypePrice: '{type} · {price}',
  legendTypePriceFrom: '{type} · from {price}',
  legendStatus: 'Seat status',
  levelGround: 'Ground floor',
  levelBalcony: 'Balcony',
  levelUpper: 'Level {level}',
  levelGridAria: '{map}: {level}',
  zones: {},
  defaultZones: {
    'up-close': 'Up close',
    'sweet-spot': 'Sweet spot',
    'full-picture': 'Full picture',
  },
  violations: {
    noSingleGap: 'Please don’t leave a single empty seat',
    sameRow: 'Please choose seats in one row',
    adjacent: 'Please choose seats next to each other',
    max: 'You can select up to {max} seats',
  },
};

type OptionalPickerKey = {
  [K in keyof PickerLabels]-?: undefined extends PickerLabels[K] ? K : never;
}[keyof PickerLabels];

/**
 * Reads a picker label that is optional in `PickerLabels` (added after the first release), with
 * the built-in English text as the fallback for label objects that do not set it.
 * @param picker - The picker labels in use.
 * @param key - The optional label key.
 * @returns The label.
 */
export function pickerLabel(
  picker: PickerLabels,
  key: Exclude<OptionalPickerKey, 'status' | 'defaultZones'>,
): Label {
  return (picker[key] as Label | undefined) ?? (pickerEn[key] as Label);
}

/**
 * The name of a viewing zone as the picker shows it: `zones[id]` when the host sets one; the
 * built-in name of a library default zone (`defaultZones`) when the hall keeps its default English
 * name (or has none); otherwise the name from the hall config, as written.
 * @param picker - The picker labels in use.
 * @param zone - The zone of the seat.
 * @param zone.id - Zone id.
 * @param zone.label - Zone name from the hall config, if any.
 * @returns The zone name.
 */
export function zoneDisplayName(
  picker: PickerLabels,
  zone: { id: string; label?: string | undefined },
): string {
  const override = picker.zones[zone.id];
  if (override) return formatLabel(override);
  const builtIn = DEFAULT_VIEWING_ZONES.find((item) => item.id === zone.id);
  const keepsDefault = builtIn !== undefined && (!zone.label || zone.label === builtIn.label);
  if (keepsDefault) {
    const named = picker.defaultZones?.[zone.id] ?? pickerEn.defaultZones?.[zone.id];
    if (named) return formatLabel(named);
  }
  return zone.label || zone.id;
}

const labelsEn: Labels = { picker: pickerEn, editor: editorLabelsEn, issues: issueMessages.en };

/**
 * Built-in English labels: the picker, the constructor and the issue texts. The `ru` property
 * remains as a compatibility alias for existing callers and holds the same English labels.
 */
export const labels: { en: Labels; ru: Labels } = {
  en: labelsEn,
  ru: labelsEn,
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
