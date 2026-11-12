/**
 * Field keys of the hall config, used by the constructor's field policy and by `validateEdit`
 * on the server. A closed union of literals (no computed paths) keeps TypeScript fast.
 */
export const FIELD_KEYS = [
  'name',
  'hall.width',
  'hall.depth',
  'hall.height',
  'hall.wallColor',
  'hall.floorColor',
  'screen.width',
  'screen.height',
  'screen.elevation',
  'screen.curvature',
  'seatType.label',
  'seatType.width',
  'seatType.depth',
  'seatType.color',
  'layout.firstRowDistance',
  'layout.rowLabels',
  'layout.seatNumbering',
  'layout.eyeHeight',
  'band.gapBefore',
  'band.riserHeight',
  'band.rows',
  'band.rowSpacing',
  'band.seatPitch',
  'band.seatType',
  'band.priceTier',
  'section.seatsPerRow',
  'section.gapBefore',
  'section.rows',
  'section.rowSpacing',
  'section.seatPitch',
  'section.seatType',
  'section.priceTier',
  'section.color',
  'section.exclude',
  /** Adding, removing, moving or renaming bands. */
  'structure.bands',
  /** Adding, removing, moving or renaming sections. */
  'structure.sections',
  /** Adding, removing or renaming seat types. */
  'structure.seatTypes',
  'constraints',
  'viewingZones',
  /** Hall prices: the price of every tier. */
  'pricing',
  'meta',
] as const;

/** One of `FIELD_KEYS`. */
export type FieldKey = (typeof FIELD_KEYS)[number];
/**
 * How a field may change. `editable` allows changes. `locked` and `hidden` both make `validateEdit`
 * report a change to the field as `field.locked`. The difference between them is presentation,
 * which the host decides.
 */
export type FieldAccess = 'editable' | 'locked' | 'hidden';
/** Access per field. A field that is not listed is editable. */
export type FieldPolicy = Partial<Record<FieldKey, FieldAccess>>;

/**
 * Maps a config path to its field key:
 * `['layout','bands',0,'sections',2,'seatPitch']` → `section.seatPitch`,
 * `['layout','bands',1,'defaults','rows']` → `band.rows`, `['seatTypes','std','color']` →
 * `seatType.color`.
 */
export function fieldKeyForPath(path: readonly (string | number)[]): FieldKey | null {
  const [a, b, c, d, e, f] = path;
  if (a === 'name') return 'name';
  if (a === 'meta') return 'meta';
  if (a === 'constraints') return 'constraints';
  if (a === 'viewingZones') return 'viewingZones';
  if (a === 'pricing') return 'pricing';
  if ((a === 'hall' || a === 'screen') && typeof b === 'string') {
    if (b === 'meta') return 'meta';
    return asKey(`${a}.${b}`);
  }
  if (a === 'seatTypes') {
    if (c === undefined) return 'structure.seatTypes';
    if (c === 'meta') return 'meta';
    return asKey(`seatType.${String(c)}`);
  }
  if (a === 'layout') {
    if (b !== 'bands') return typeof b === 'string' ? asKey(`layout.${b}`) : null;
    if (c === undefined || d === undefined) return 'structure.bands';
    if (d === 'id') return 'structure.bands';
    if (d === 'meta') return 'meta';
    if (d === 'defaults') return typeof e === 'string' ? asKey(`band.${e}`) : null;
    if (d === 'sections') {
      if (e === undefined || f === undefined || f === 'id') return 'structure.sections';
      if (f === 'meta') return 'meta';
      return asKey(`section.${String(f)}`);
    }
    return typeof d === 'string' ? asKey(`band.${d}`) : null;
  }
  return null;
}

const KEY_SET: ReadonlySet<string> = new Set(FIELD_KEYS);
function asKey(value: string): FieldKey | null {
  return KEY_SET.has(value) ? (value as FieldKey) : null;
}
