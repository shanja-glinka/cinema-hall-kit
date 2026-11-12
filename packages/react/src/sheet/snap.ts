/**
 * A snap point: a fraction of the sheet height (0…1), pixels (above 1), or `peek`: the measured
 * height of the header and compact content.
 */
export type SnapValue = number | 'peek';

/** Closed, the measured peek, fully open. */
export const DEFAULT_SNAP_POINTS: SnapValue[] = [0, 'peek', 1];
/** Used until the compact content has been measured (pixels). */
/** Peek height used until the compact content has been measured. */
export const FALLBACK_PEEK_PX = 160;

/**
 * Converts snap points to what react-modal-sheet expects: values in (0, 1] are fractions of the
 * sheet height, larger values are pixels from the bottom. `peek` becomes pixels, so the peek height
 * does not depend on the sheet height. The order of the input is kept; numeric pixel values stay.
 * @param points - Configured snap points.
 * @param peekPx - Measured peek height in pixels.
 * @returns Resolved points. Throws `RangeError` for a non-finite, negative or mis-ordered point.
 */
export function resolveSnapPoints(points: readonly SnapValue[], peekPx: number): number[] {
  const peek = Number.isFinite(peekPx) && peekPx > 1 ? Math.round(peekPx) : FALLBACK_PEEK_PX;
  const resolved = points.map((point) => (point === 'peek' ? peek : point));
  if (resolved.some((point) => !Number.isFinite(point) || point < 0))
    throw new RangeError('Sheet snap points must be finite, non-negative fractions or pixels.');
  if (resolved.length < 2 || resolved[0] !== 0 || resolved[resolved.length - 1] !== 1)
    throw new RangeError('Sheet snap points must start at 0 and end at 1.');
  for (let i = 1; i < resolved.length - 1; i++) {
    const previous = resolved[i - 1]!;
    const point = resolved[i]!;
    // Fractions and pixels can only be compared once the sheet height is known.
    if (previous <= 1 === point <= 1 && point < previous)
      throw new RangeError('Sheet snap points must be in ascending visible-height order.');
  }
  return resolved;
}

/**
 * Index into the snap points for `initialSnap`: a number is an index, `peek` finds the peek point.
 * @param points - Configured snap points.
 * @param initial - The configured initial snap.
 * @returns A valid index.
 */
export function initialSnapIndex(
  points: readonly SnapValue[],
  initial: SnapValue | undefined,
): number {
  if (initial === undefined)
    return points.includes('peek') ? points.indexOf('peek') : Math.max(0, points.length - 1);
  if (initial === 'peek') return Math.max(0, points.indexOf('peek'));
  return Math.min(Math.max(0, Math.trunc(initial)), Math.max(0, points.length - 1));
}

/**
 * Resolve mixed units against the measured sheet height before asking it to snap.
 * @param points - Resolved snap points.
 * @param height - Measured sheet height in pixels (0 = not measured, nothing to check).
 * @returns Nothing. Throws `RangeError` when the visible heights are not ascending.
 */
export function validateSnapOrder(points: readonly number[], height: number): void {
  if (height <= 0) return;
  const pixels = points.map((point) => Math.min(height, point <= 1 ? point * height : point));
  if (pixels.some((point, index) => index > 0 && point < pixels[index - 1]!))
    throw new RangeError('Sheet snap points must be in ascending visible-height order.');
}

/**
 * Bounds a measured peek (pixels) to the sheet: strictly below the full height and below the next
 * snap, so the points stay strictly ascending in any container, however short.
 * @param peekPx - Measured peek height in pixels.
 * @param sheetHeightPx - Real height of the sheet container in pixels.
 * @param next - The snap point after the peek (fraction of the height, pixels), if any.
 * @returns A peek of at least 2 px (1 or less would read as a fraction) that fits.
 */
export function fitPeek(peekPx: number, sheetHeightPx: number, next?: SnapValue): number {
  const nextPx =
    typeof next === 'number' && next > 0 ? (next <= 1 ? next * sheetHeightPx : next) : Infinity;
  const limit = Math.min(sheetHeightPx, nextPx) - 1;
  return Math.max(2, Math.min(peekPx, Math.floor(limit)));
}
