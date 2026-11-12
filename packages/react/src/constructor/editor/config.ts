import {
  parseHallConfig,
  validateHall,
  type BandConfig,
  type Constraints,
  type HallConfig,
  type Issue,
} from '@cinema-hall/core';
import type { IssueTarget } from './types.js';

/**
 * Whether a value is a plain object.
 * @param value Any value.
 * @returns True for a non-array object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * JSON with sorted keys and no `undefined` members: equal configs give equal strings.
 * @param value Any JSON-like value.
 * @returns The canonical string.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (isRecord(value)) {
    const members = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${members.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Whether two configs are equal by value.
 * @param a First config.
 * @param b Second config.
 * @returns True when equal.
 */
export function sameConfig(a: HallConfig, b: HallConfig): boolean {
  return a === b || canonicalJson(a) === canonicalJson(b);
}

/**
 * Deep merge of a patch into a value. Plain objects merge key by key, anything else (arrays,
 * primitives) replaces the target, and an `undefined` removes the key. Never mutates `target`.
 * @param target Value to patch.
 * @param patch Partial value.
 * @returns The merged copy.
 */
export function applyPatch(target: unknown, patch: unknown): unknown {
  if (!isRecord(patch)) return patch;
  const base = isRecord(target) ? target : {};
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete out[key];
    else out[key] = applyPatch(base[key], value);
  }
  return out;
}

/** Thrown by a transition builder when its target does not exist; the editor turns it into an issue. */
export class EditorRejection extends Error {
  readonly issues: Issue[];

  constructor(issues: Issue[]) {
    super('Editor action rejected');
    this.name = 'EditorRejection';
    this.issues = issues;
  }
}

/**
 * Builds the rejection for a missing target.
 * @param kind Kind of object.
 * @param id Missing id.
 * @param path Config path.
 * @returns The rejection to throw.
 */
export function notFound(
  kind: 'band' | 'section' | 'seatType',
  id: string,
  path: (string | number)[],
): EditorRejection {
  return new EditorRejection([
    { severity: 'error', code: 'editor.notFound', path, params: { kind, id } },
  ]);
}

/**
 * Every band and section id: they share one namespace for generated ids.
 * @param config Current hall.
 * @returns The ids in use.
 */
export function structureIds(config: HallConfig): Set<string> {
  const ids = new Set<string>();
  for (const band of config.layout.bands) {
    ids.add(band.id);
    for (const section of band.sections) ids.add(section.id);
  }
  return ids;
}

/**
 * `base`, or `base-2`, `base-3`, … whichever is free. Keeps ids short and readable.
 * @param base Preferred id.
 * @param taken Ids in use.
 * @returns A free id.
 */
export function uniqueId(base: string, taken: ReadonlySet<string>): string {
  const stem = base.slice(0, 48);
  if (!taken.has(stem)) return stem;
  for (let n = 2; ; n += 1) {
    const candidate = `${stem}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * `base-N` with the smallest N from `start` that is free: generated ids read "band-3", "section-4"
 * and the plan shows them as "Band 3" / "Section 4".
 * @param base Id stem.
 * @param start First number to try (the new object's position in the hall).
 * @param taken Ids in use.
 * @returns A free id.
 */
export function numberedId(base: string, start: number, taken: ReadonlySet<string>): string {
  for (let n = Math.max(1, start); ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** The thresholds the editor validates with; new objects are fitted against the same ones. */
export interface FitOptions {
  /** The host's constraint overrides (`useHallEditor({ constraints })`). */
  constraints?: Partial<Constraints>;
}

/**
 * How far a candidate overflows the hall, in metres: the sum of `required - available` of its
 * `fit.width` and `fit.depth` errors, judged with the editor's own constraints. A candidate is checked
 * structurally first, because layout and fit rules assume a valid hall.
 * @param config A candidate hall, possibly structurally invalid.
 * @param fit Constraint overrides.
 * @returns The overflow (0 when it fits), or null when the candidate is structurally invalid.
 */
export function fitOverflow(config: unknown, fit: FitOptions = {}): number | null {
  const parsed = parseHallConfig(config);
  if (!parsed.ok) return null;
  let total = 0;
  for (const issue of validateHall(parsed.config, { constraints: fit.constraints })) {
    if (issue.code !== 'fit.width' && issue.code !== 'fit.depth') continue;
    const required = Number(issue.params?.required);
    const available = Number(issue.params?.available);
    total += Number.isFinite(required - available) ? Math.max(0, required - available) : 1;
  }
  return total;
}

/**
 * The first candidate (largest first) that is valid and does not overflow the hall more than `config`
 * already does. When none qualifies, the valid one that overflows least, else the first candidate, so a
 * structural rejection is reported by the action and nothing throws.
 * @param config Current hall.
 * @param candidates Candidate values, preferred first; must not be empty.
 * @param build Builds the candidate hall for a value.
 * @param fit Constraint overrides of the editor.
 * @returns The chosen value.
 */
export function firstThatFits<T>(
  config: HallConfig,
  candidates: readonly [T, ...T[]],
  build: (value: T) => unknown,
  fit: FitOptions = {},
): T {
  const before = fitOverflow(config, fit) ?? 0;
  let best: { value: T; overflow: number } | undefined;
  for (const value of candidates) {
    const overflow = fitOverflow(build(value), fit);
    if (overflow === null) continue;
    if (overflow <= before + 0.001) return value;
    if (best === undefined || overflow < best.overflow) best = { value, overflow };
  }
  return best?.value ?? candidates[0];
}

/**
 * Finds a band by id or throws a rejection.
 * @param config Current hall.
 * @param id Band id.
 * @returns The band and its index.
 */
export function findBand(config: HallConfig, id: string): { index: number; band: BandConfig } {
  const index = config.layout.bands.findIndex((band) => band.id === id);
  const band = config.layout.bands[index];
  if (index < 0 || band === undefined) throw notFound('band', id, ['layout', 'bands']);
  return { index, band };
}

/**
 * Moves the item at `from` so that it ends at `to` (clamped). Returns a new array.
 * @param items Source list.
 * @param from Current index.
 * @param to Target index.
 * @returns A new list.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

/**
 * Returns a config with other bands.
 * @param config Current hall.
 * @param bands New bands.
 * @returns The candidate config.
 */
export function replaceBands(config: HallConfig, bands: readonly unknown[]): unknown {
  return { ...config, layout: { ...config.layout, bands } };
}

function isPathTarget(target: IssueTarget): target is readonly (string | number)[] {
  return Array.isArray(target);
}

/**
 * Issues about a path (prefix match) or about a stable reference (every given id must match).
 * @param issues Issues to filter.
 * @param target Path prefix or stable reference.
 * @returns The matching issues.
 */
export function issuesMatching(issues: readonly Issue[], target: IssueTarget): Issue[] {
  if (isPathTarget(target)) {
    return issues.filter(
      (issue) =>
        target.length <= issue.path.length &&
        target.every((part, index) => issue.path[index] === part),
    );
  }
  const keys = (['bandId', 'sectionId', 'seatTypeId'] as const).filter(
    (key) => target[key] !== undefined,
  );
  if (keys.length === 0) return [];
  return issues.filter((issue) => keys.every((key) => issue.ref?.[key] === target[key]));
}
