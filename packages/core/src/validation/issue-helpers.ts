import type { Issue, IssueRef, IssueSeverity } from '../issues.js';
import { isPlainObject } from './helpers.js';

/** A location inside a config: keys and array indexes, as used by `Issue.path`. */
export type IssuePath = (string | number)[];

/**
 * Value at a path inside an arbitrary source (raw input or config); `undefined` when absent.
 * Only own properties count, so a key such as `constructor` is not read from the prototype.
 */
export function valueAt(source: unknown, path: readonly (string | number)[]): unknown {
  let node: unknown = source;
  for (const part of path) {
    if (typeof node !== 'object' || node === null || !Object.hasOwn(node, part)) return undefined;
    node = (node as Record<string | number, unknown>)[part];
  }
  return node;
}

function idOf(value: unknown): string | undefined {
  return isPlainObject(value) && typeof value.id === 'string' ? value.id : undefined;
}

/** Stable references (band, section, seat type) for the place a path points into. */
export function refForPath(
  source: unknown,
  path: readonly (string | number)[],
): IssueRef | undefined {
  const ref: IssueRef = {};
  const [a, b, c, d, e] = path;
  if (a === 'layout' && b === 'bands' && typeof c === 'number') {
    const bandId = idOf(valueAt(source, ['layout', 'bands', c]));
    if (bandId !== undefined) ref.bandId = bandId;
    if (d === 'sections' && typeof e === 'number') {
      const sectionId = idOf(valueAt(source, ['layout', 'bands', c, 'sections', e]));
      if (sectionId !== undefined) ref.sectionId = sectionId;
    }
  }
  if (a === 'seatTypes' && typeof b === 'string') ref.seatTypeId = b;
  return Object.keys(ref).length > 0 ? ref : undefined;
}

/**
 * Builds an issue at `path`. `source` is the object that the path points into, and it is used to
 * attach the stable `ref`. `params` is left out of the issue when it is not given.
 */
export function makeIssue(
  source: unknown,
  severity: IssueSeverity,
  code: string,
  path: IssuePath,
  params?: Record<string, string | number>,
): Issue {
  const ref = refForPath(source, path);
  return {
    severity,
    code,
    path: [...path],
    ...(ref ? { ref } : {}),
    ...(params ? { params } : {}),
  };
}
