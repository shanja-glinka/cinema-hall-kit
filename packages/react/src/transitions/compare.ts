/**
 * Structural equality for transition configs: data is compared by value, functions (easing, camera
 * paths) by identity, so a changed function is seen as a change.
 * @param a - First config.
 * @param b - Second config.
 * @returns `true` when both are equal.
 */
export function sameConfig(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a === 'function' || typeof b === 'function') return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => sameConfig(value, b[index]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    return keys.every((key) => key in b && sameConfig(a[key], b[key]));
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
