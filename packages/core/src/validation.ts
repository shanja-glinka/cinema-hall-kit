/**
 * Semantic validation of a hall config (geometry, comfort and view rules), the edit policy check
 * and human-readable issue texts.
 */
import { buildHallLayout, type HallLayout } from './layout.js';
import type { Constraints, HallConfig } from './schema.js';
import { resolveConstraints, type ConstraintOptions } from './constraints.js';
import type { BuiltInIssueCode, Issue, IssueCode } from './issues.js';
import { fieldKeyForPath, type FieldAccess, type FieldKey, type FieldPolicy } from './fields.js';
import { builtInRules } from './validation/rules/index.js';
import { issueMessages } from './messages/index.js';
import { deepEqual, isPlainObject, ownValue } from './validation/helpers.js';
import { makeIssue } from './validation/issue-helpers.js';
import {
  markResolvedContext,
  resolveRuleContext,
  type ResolvedRuleContext,
} from './validation/context.js';

export {
  issueMessages,
  resolveConstraints,
  resolveRuleContext,
  type ConstraintOptions,
  type ResolvedRuleContext,
};

/**
 * What a validation rule receives: the config, its layout and the constraint thresholds in effect
 * (see `resolveConstraints`). `validateHall` passes the layout from `buildHallLayout` (a
 * `BuiltHallLayout`, so every level and balcony field is set) and every threshold with its default
 * applied (a `ResolvedConstraints`). The fields keep their wider types so that a context built by
 * hand, with a `HallLayout` and a `Constraints` object, still type-checks; call
 * `resolveRuleContext(ctx)` to read it with every field set.
 */
export interface ValidationRuleContext {
  config: HallConfig;
  layout: HallLayout;
  constraints: Constraints;
}

/**
 * A semantic check. `check` returns the issues that it finds, or an empty array when the config
 * passes. Add custom rules through `ValidateOptions.extraRules`.
 */
export interface ValidationRule {
  /** Name of the rule. The issues it returns carry their own codes. */
  code: string;
  check(ctx: ValidationRuleContext): Issue[];
}

/** Options for `validateHall`. Every field is optional. */
export interface ValidateOptions extends ConstraintOptions {
  /** Custom rules, run after the built-in ones. */
  extraRules?: ValidationRule[];
  /**
   * Per issue code: `error` or `warning` replaces the severity of the issue, and `off` drops it.
   */
  severity?: Partial<Record<IssueCode, 'error' | 'warning' | 'off'>>;
  /** Threshold overrides. They take priority over the config's own `constraints`. */
  constraints?: Partial<Constraints>;
  /** Server mode: ignore `config.constraints`; only `opts.constraints` and defaults apply. */
  enforce?: boolean;
}

/**
 * The built-in semantic rules, in the order their issues are reported. Pass extra rules through
 * `ValidateOptions.extraRules` rather than changing this array.
 */
export const defaultRules: ValidationRule[] = builtInRules;

/**
 * Semantic validation of a structurally valid config (`parseHallConfig` guarantees it).
 * Severity overrides apply to every issue; `'off'` drops it.
 *
 * @example
 * ```ts
 * const issues = validateHall(config, { severity: { 'pricing.missingTier': 'off' } });
 * ```
 */
export function validateHall(config: HallConfig, opts: ValidateOptions = {}): Issue[] {
  const constraints = resolveConstraints(config, opts);
  // The layout carries the balcony sizes of these same constraints, so what the rules check is
  // what a renderer draws from the layout.
  const layout = buildHallLayout(config, { constraints: opts.constraints, enforce: opts.enforce });
  const context: ValidationRuleContext = markResolvedContext({ config, layout, constraints });
  const rules = [...defaultRules, ...(opts.extraRules ?? [])];
  const issues: Issue[] = [];
  for (const rule of rules) {
    for (const issue of rule.check(context)) {
      const override = ownValue(opts.severity, issue.code);
      if (override === 'off') continue;
      issues.push(override ? { ...issue, severity: override } : issue);
    }
  }
  return issues;
}

type Path = (string | number)[];
/** Where a changed path exists: `prev` for the leaves of a removed item, `next` otherwise. */
type Side = 'prev' | 'next';
interface Change {
  path: Path;
  side: Side;
}
type IdItem = Record<string, unknown> & { id: string };

function isIdList(value: unknown): value is IdItem[] {
  return (
    Array.isArray(value) &&
    value.every((item) => isPlainObject(item) && typeof item.id === 'string')
  );
}

const isContainer = (value: unknown): boolean => Array.isArray(value) || isPlainObject(value);
const allUnique = (ids: string[]): boolean => new Set(ids).size === ids.length;
/** Items can be matched by id when every id is a non-empty string and no id repeats. */
const isMatchable = (items: IdItem[]): boolean =>
  items.every((item) => item.id !== '') && allUnique(items.map((item) => item.id));
/** Same ids in the same order, compared element by element (no separator can collide). */
const sameIds = (prev: IdItem[], next: IdItem[]): boolean =>
  prev.length === next.length && prev.every((item, index) => item.id === next[index]?.id);

/**
 * Leaves of a value that was added, removed or re-typed. A leaf is reported when its field differs
 * from `field` (the field of the key that holds the value), so a protected leaf inside a subtree
 * is never missed, and a field already reported at the key is not reported again.
 */
function collectLeaves(
  value: unknown,
  path: Path,
  out: Change[],
  field: FieldKey | null,
  side: Side,
): void {
  if (Array.isArray(value) && value.length > 0) {
    value.forEach((item, index) => collectLeaves(item, [...path, index], out, field, side));
    return;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined);
    if (keys.length > 0) {
      for (const key of keys) collectLeaves(value[key], [...path, key], out, field, side);
      return;
    }
  }
  if (value !== undefined && fieldKeyForPath(path) !== field) out.push({ path, side });
}

/** A key whose value was added, removed or changed kind: the key itself, then its leaves. */
function collectReplaced(
  prev: unknown,
  next: unknown,
  path: Path,
  out: Change[],
  prevPath: Path,
): void {
  const field = fieldKeyForPath(path);
  out.push(next === undefined ? { path: prevPath, side: 'prev' } : { path, side: 'next' });
  collectLeaves(prev, prevPath, out, field, 'prev');
  collectLeaves(next, path, out, field, 'next');
}

/**
 * Items of two id lists matched by their (unique, non-empty) ids. An item present on one side only
 * is reported leaf by leaf, as an added or removed subtree; its own path is covered by the change
 * of the id list, which `collectChanges` always records.
 */
function collectMatched(
  prev: IdItem[],
  next: IdItem[],
  path: Path,
  out: Change[],
  prevPath: Path,
): void {
  const prevIndex = new Map(prev.map((item, index): [string, number] => [item.id, index]));
  const nextIds = new Set(next.map((item) => item.id));
  next.forEach((item, index) => {
    const before = prevIndex.get(item.id);
    const itemPath = [...path, index];
    if (before === undefined) {
      collectLeaves(item, itemPath, out, fieldKeyForPath(itemPath), 'next');
    } else {
      collectChanges(prev[before], item, itemPath, out, [...prevPath, before]);
    }
  });
  prev.forEach((item, index) => {
    const itemPath = [...prevPath, index];
    if (!nextIds.has(item.id))
      collectLeaves(item, itemPath, out, fieldKeyForPath(itemPath), 'prev');
  });
}

/**
 * Collects the changes from `prev` to `next`, each at the path where it exists. Id lists whose ids
 * are matchable on both sides are matched by id; otherwise they are compared index by index. Any
 * change of an id list is recorded at the list, so an item added or removed is reported under the
 * list's own field, including `meta` (where its leaves share that field and are not reported).
 */
function collectChanges(
  prev: unknown,
  next: unknown,
  path: Path,
  out: Change[],
  prevPath: Path = path,
): void {
  if (deepEqual(prev, next)) return;
  if (isIdList(prev) && isIdList(next)) {
    if (!sameIds(prev, next)) out.push({ path, side: 'next' });
    if (isMatchable(prev) && isMatchable(next)) {
      collectMatched(prev, next, path, out, prevPath);
      return;
    }
  }
  if (isPlainObject(prev) && isPlainObject(next)) {
    for (const key of new Set([...Object.keys(prev), ...Object.keys(next)])) {
      collectChanges(ownValue(prev, key), ownValue(next, key), [...path, key], out, [
        ...prevPath,
        key,
      ]);
    }
    return;
  }
  if (Array.isArray(prev) && Array.isArray(next)) {
    if (prev.length !== next.length) out.push({ path, side: 'next' });
    const field = fieldKeyForPath(path);
    const shared = Math.min(prev.length, next.length);
    for (let i = 0; i < shared; i++) {
      collectChanges(prev[i], next[i], [...path, i], out, [...prevPath, i]);
    }
    for (let i = shared; i < prev.length; i++) {
      collectLeaves(prev[i], [...prevPath, i], out, field, 'prev');
    }
    for (let i = shared; i < next.length; i++) {
      collectLeaves(next[i], [...path, i], out, field, 'next');
    }
    return;
  }
  if (!isContainer(prev) && !isContainer(next) && prev !== undefined && next !== undefined) {
    out.push({ path, side: 'next' });
    return;
  }
  collectReplaced(prev, next, path, out, prevPath);
}

/**
 * Access of a field in the policy. Inherited entries count, as the policy may be built with a
 * prototype; a value other than the three access levels is ignored.
 */
function accessOf(policy: FieldPolicy, field: FieldKey): FieldAccess | undefined {
  const access: unknown = policy?.[field];
  return access === 'editable' || access === 'locked' || access === 'hidden' ? access : undefined;
}

/** `field.locked` errors for every change `next` makes to a field the policy locks or hides. */
export function validateEdit(prev: HallConfig, next: HallConfig, policy: FieldPolicy): Issue[] {
  const changes: Change[] = [];
  collectChanges(prev, next, [], changes);
  const seen = new Set<string>();
  const issues: Issue[] = [];
  for (const { path, side } of changes) {
    const field = fieldKeyForPath(path);
    if (field === null) continue;
    const access = accessOf(policy, field);
    if (access !== 'locked' && access !== 'hidden') continue;
    const id = JSON.stringify(path);
    if (seen.has(id)) continue;
    seen.add(id);
    // A 'prev' change (a removed value) carries its path in `prev`, so path and ref are read there.
    issues.push(makeIssue(side === 'prev' ? prev : next, 'error', 'field.locked', path, { field }));
  }
  return issues;
}

/**
 * Message templates by issue code. `formatIssue` uses them in place of the built-in English
 * messages for those codes. A string may contain `{name}` placeholders, filled from the
 * issue's params. A function receives the params and returns the text.
 */
export type IssueMessages = Partial<
  Record<IssueCode, string | ((params: Record<string, string | number>) => string)>
>;

/**
 * Human text for an issue; built-in messages are in English. Unknown codes return the code.
 *
 * @example
 * ```ts
 * const text = formatIssue(issue, undefined, 'en-US');
 * ```
 */
export function formatIssue(issue: Issue, messages?: IssueMessages, locale?: string): string {
  const params = issue.params ?? {};
  // `locale` remains accepted for API compatibility. Built-in messages are English for every
  // locale; pass custom `messages` when an application needs different wording.
  void locale;
  const builtIn: Partial<Record<BuiltInIssueCode, string>> = issueMessages.en;
  const template = ownValue(messages, issue.code) ?? ownValue(builtIn, issue.code);
  if (template === undefined) return issue.code;
  const text = typeof template === 'function' ? template(params) : template;
  return text.replace(/\{(\w+)\}/g, (match: string, name: string) => {
    const value = ownValue(params, name);
    return value === undefined ? match : String(value);
  });
}
