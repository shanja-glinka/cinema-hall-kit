import { resolveSection, type ResolvedSection } from '../layout.js';
import type { BandConfig, HallConfig, SectionConfig } from '../schema.js';

/** Float tolerance for threshold comparisons (metres, degrees). */
export const EPS = 1e-9;

/**
 * Rounds to two decimals for the params of an issue. Do not compare rounded values: use `exceeds`
 * or `below`.
 */
export const round2 = (value: number): number => Math.round(value * 100) / 100;
/** True when `value` is above `limit` by more than `EPS`. */
export const exceeds = (value: number, limit: number): boolean => value > limit + EPS;
/** True when `value` is below `limit` by more than `EPS`. */
export const below = (value: number, limit: number): boolean => value < limit - EPS;
/** Converts radians to degrees. */
export const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

/** True for a non-null object that is not an array. The prototype is not checked. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Own-property read of a map: inherited names such as `constructor` or `toString` are not entries.
 * A missing map (`undefined` or `null`, as JSON input can carry) has no entries.
 */
export function ownValue<T>(
  record: Partial<Record<string, T>> | null | undefined,
  key: string,
): T | undefined {
  return record !== undefined && record !== null && Object.hasOwn(record, key)
    ? record[key]
    : undefined;
}

function definedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((key) => value[key] !== undefined);
}

/** Structural equality for JSON-like values; object key order does not matter. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    const other = b as unknown[];
    return a.length === other.length && a.every((item, i) => deepEqual(item, other[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = definedKeys(a);
    // Own keys only: an inherited property (e.g. a parsed "__proto__" key) must never compare equal.
    return (
      keys.length === definedKeys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]))
    );
  }
  return false;
}

/**
 * One section of the config, with its band, its indexes in the config and its resolved values (see
 * `sectionEntries`).
 */
export interface SectionEntry {
  bandIndex: number;
  sectionIndex: number;
  band: BandConfig;
  section: SectionConfig;
  resolved: ResolvedSection;
}

/** Every section with its band defaults applied. Requires a structurally valid config. */
export function sectionEntries(config: HallConfig): SectionEntry[] {
  return config.layout.bands.flatMap((band, bandIndex) =>
    band.sections.map((section, sectionIndex) => ({
      bandIndex,
      sectionIndex,
      band,
      section,
      resolved: resolveSection(band, section),
    })),
  );
}

/**
 * The path of a section in the config: `['layout', 'bands', band, 'sections', section]`. Validation
 * issues about a section are reported under this path.
 */
export function sectionPath(
  entry: Pick<SectionEntry, 'bandIndex' | 'sectionIndex'>,
): (string | number)[] {
  return ['layout', 'bands', entry.bandIndex, 'sections', entry.sectionIndex];
}
