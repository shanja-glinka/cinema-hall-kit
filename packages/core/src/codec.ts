/**
 * Hall config codec: parses YAML or JSON text into a validated `HallConfig` and serializes it back.
 * With a YAML `source`, serialization keeps the source's comments and key order where values
 * remain.
 */
import type { z } from 'zod';
import {
  isAlias,
  isMap,
  isNode,
  isSeq,
  LineCounter,
  parseDocument,
  stringify,
  visit,
  type Document,
  type YAMLMap,
  type YAMLSeq,
} from 'yaml';
import type { Issue } from './issues.js';
import { HallConfigSchema, LIMITS, SUPPORTED_CONFIG_VERSION, type HallConfig } from './schema.js';
import { validateHall } from './validation.js';
import { deepEqual, isPlainObject } from './validation/helpers.js';
import { makeIssue, valueAt } from './validation/issue-helpers.js';

/** Options for `parseHallConfig`. Every field is optional. */
export interface ParseOptions {
  /**
   * YAML 1.2 is a superset of JSON, so both are read by one parser under the same guards.
   * The format only selects the wording of syntax errors (`JSON: …` for `json`).
   */
  format?: 'yaml' | 'json' | 'auto';
  /** Throw `HallConfigError` on structural errors instead of returning `ok: false`. */
  strict?: boolean;
  /** Default `LIMITS.maxBytes`. */
  maxBytes?: number;
}

/**
 * Outcome of `parseHallConfig`.
 * `ok: true` means the input is a structurally valid config and `config` is set. `issues` may still
 * hold semantic errors and warnings, so check `hasErrors(issues)` before using the config.
 * `ok: false` means the input could not be read or failed the structural checks. Only `issues` is
 * set.
 */
export type ParseResult =
  { ok: true; config: HallConfig; issues: Issue[] } | { ok: false; issues: Issue[] };

/**
 * Thrown by `parseHallConfig` in strict mode when the input fails the structural checks. `message`
 * summarises the issues.
 */
export class HallConfigError extends Error {
  /** Every structural issue that made the parse fail. */
  readonly issues: Issue[];
  constructor(issues: Issue[]) {
    super(
      `Invalid hall config: ${issues.map((i) => `${i.code} at ${i.path.join('.') || '<root>'}`).join('; ')}`,
    );
    this.name = 'HallConfigError';
    this.issues = issues;
  }
}

type Position = { line: number; col: number };
type Format = NonNullable<ParseOptions['format']>;
type Decoded = { ok: true; data: unknown } | { ok: false; issues: Issue[] };

/** Nodes are written without anchors: an object that appears twice in a config is written twice. */
const NO_ALIASES = { aliasDuplicateObjects: false } as const;

/**
 * Parses YAML or JSON text, or an already-decoded object, into a hall config.
 * A string is size-checked, decoded and checked against the schema and the structural rules. Any
 * other value is checked as it is. Semantic rules (fit, rows, view and pricing) run on a
 * structurally valid config and are returned in `issues`.
 *
 * With `strict: true`, a structural failure throws `HallConfigError` instead of returning `ok:
 * false`.
 *
 * @example
 * ```ts
 * const result = parseHallConfig(yamlText);
 * if (result.ok) console.log(result.config.name, result.issues);
 * ```
 */
export function parseHallConfig(
  input: unknown,
  opts: ParseOptions & { strict: true },
): { ok: true; config: HallConfig; issues: Issue[] };
export function parseHallConfig(input: unknown, opts?: ParseOptions): ParseResult;
/** Implementation of the overloads above. See them for the public contract. */
export function parseHallConfig(input: unknown, opts: ParseOptions = {}): ParseResult {
  const result = parseInput(input, opts);
  if (opts.strict && !result.ok) throw new HallConfigError(result.issues);
  return result;
}

function failed(issues: Issue[]): ParseResult {
  return { ok: false, issues };
}

function parseInput(input: unknown, opts: ParseOptions): ParseResult {
  let data: unknown = input;
  if (typeof input === 'string') {
    const limit = opts.maxBytes ?? LIMITS.maxBytes;
    const size = new TextEncoder().encode(input).byteLength;
    if (size > limit) {
      return failed([
        { severity: 'error', code: 'schema.tooLarge', path: [], params: { maxBytes: limit, size } },
      ]);
    }
    const decoded = decodeText(input, opts.format ?? 'auto');
    if (!decoded.ok) return failed(decoded.issues);
    data = decoded.data;
  }
  const version = isPlainObject(data) ? data.version : undefined;
  if (typeof version === 'number' && version > SUPPORTED_CONFIG_VERSION) {
    return failed([
      {
        severity: 'error',
        code: 'schema.unsupportedVersion',
        path: ['version'],
        params: { version, supported: SUPPORTED_CONFIG_VERSION },
      },
    ]);
  }
  const parsed = HallConfigSchema.safeParse(data);
  if (!parsed.success) {
    return failed(parsed.error.issues.flatMap((issue) => mapZodIssue(issue, data)));
  }
  const structural = checkStructure(parsed.data);
  if (structural.length > 0) return failed(structural);
  return { ok: true, config: parsed.data, issues: validateHall(parsed.data) };
}

function syntaxIssue(reason: string, position?: Position): Issue {
  return {
    severity: 'error',
    code: 'schema.syntax',
    path: [],
    params: { reason },
    ...(position ? { position } : {}),
  };
}

/**
 * Reads YAML or JSON text with the YAML parser. Duplicate keys, aliases, anchors and explicit tags
 * are refused in both; `format` only changes the wording of syntax errors.
 */
function decodeText(text: string, format: Format): Decoded {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, uniqueKeys: true });
  if (doc.errors.length > 0) {
    return {
      ok: false,
      issues: doc.errors.map((error) =>
        syntaxIssue(
          error.code === 'DUPLICATE_KEY' ? 'duplicate key' : syntaxReason(error.message, format),
          lineCounter.linePos(error.pos[0]),
        ),
      ),
    };
  }
  const forbidden = forbiddenConstruct(doc);
  if (forbidden !== undefined) return { ok: false, issues: [syntaxIssue(forbidden)] };
  return { ok: true, data: doc.toJS() as unknown };
}

function syntaxReason(message: string, format: Format): string {
  const first = message.split('\n')[0] ?? message;
  return format === 'json' ? `JSON: ${first}` : first;
}

/**
 * Aliases, anchors and explicit tags are rejected: they let a small file expand into a large one.
 */
function forbiddenConstruct(doc: Document): string | undefined {
  const found = new Set<string>();
  visit(doc, {
    Node(_key, node) {
      const { anchor, tag } = node as { anchor?: string; tag?: string };
      if (isAlias(node)) found.add('aliases are not allowed');
      if (anchor !== undefined) found.add('anchors are not allowed');
      if (tag !== undefined) found.add('custom tags are not allowed');
    },
  });
  const reasons = [
    'aliases are not allowed',
    'anchors are not allowed',
    'custom tags are not allowed',
  ];
  return reasons.find((reason) => found.has(reason));
}

function mapZodIssue(issue: z.core.$ZodIssue, source: unknown): Issue[] {
  const path = issue.path.map((part) => (typeof part === 'symbol' ? part.toString() : part));
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) =>
      makeIssue(source, 'error', 'schema.unknownKey', [...path, key], { key }),
    );
  }
  if (valueAt(source, path) === undefined)
    return [makeIssue(source, 'error', 'schema.required', path)];
  switch (issue.code) {
    case 'invalid_type':
      return [makeIssue(source, 'error', 'schema.invalidType', path, { expected: issue.expected })];
    case 'too_small':
      return [
        makeIssue(source, 'error', 'schema.tooSmall', path, { minimum: Number(issue.minimum) }),
      ];
    case 'too_big':
      return [
        makeIssue(source, 'error', 'schema.tooBig', path, { maximum: Number(issue.maximum) }),
      ];
    case 'invalid_format':
      return [makeIssue(source, 'error', 'schema.invalidFormat', path, { format: issue.format })];
    case 'invalid_value':
      return [
        makeIssue(source, 'error', 'schema.invalidValue', path, {
          expected: issue.values.map(String).join(', '),
        }),
      ];
    default:
      return [makeIssue(source, 'error', 'schema.invalidValue', path, { expected: issue.message })];
  }
}

/** Structural checks beyond zod: unique ids, seat type references, resolvable sections, limits. */
export function checkStructure(config: HallConfig): Issue[] {
  const issues: Issue[] = [];
  const add = (
    code: string,
    path: (string | number)[],
    params?: Record<string, string | number>,
  ) => {
    issues.push(makeIssue(config, 'error', code, path, params));
  };
  const bands = config.layout.bands;
  const seatTypeIds = new Set(Object.keys(config.seatTypes));

  const bandIds = new Set<string>();
  const sectionIds = new Set<string>();
  bands.forEach((band, bi) => {
    if (bandIds.has(band.id))
      add('schema.duplicateId', ['layout', 'bands', bi, 'id'], { id: band.id });
    bandIds.add(band.id);
    band.sections.forEach((section, si) => {
      if (sectionIds.has(section.id)) {
        add('schema.duplicateId', ['layout', 'bands', bi, 'sections', si, 'id'], {
          id: section.id,
        });
      }
      sectionIds.add(section.id);
    });
  });
  const zoneIds = new Set<string>();
  (config.viewingZones ?? []).forEach((zone, zi) => {
    if (zoneIds.has(zone.id))
      add('schema.duplicateId', ['viewingZones', zi, 'id'], { id: zone.id });
    zoneIds.add(zone.id);
  });

  if (seatTypeIds.size === 0) add('schema.tooSmall', ['seatTypes'], { minimum: 1 });
  if (seatTypeIds.size > LIMITS.maxSeatTypes) {
    add('schema.tooBig', ['seatTypes'], { maximum: LIMITS.maxSeatTypes });
  }

  const sectionCount = bands.reduce((n, band) => n + band.sections.length, 0);
  if (sectionCount > LIMITS.maxSections) {
    add('schema.tooManySections', ['layout', 'bands'], {
      count: sectionCount,
      max: LIMITS.maxSections,
    });
  }

  let totalRows = 0;
  let totalSeats = 0;
  bands.forEach((band, bi) => {
    const defaults = band.defaults;
    if (defaults?.seatType !== undefined && !seatTypeIds.has(defaults.seatType)) {
      add('schema.unknownSeatType', ['layout', 'bands', bi, 'defaults', 'seatType'], {
        seatType: defaults.seatType,
      });
    }
    let bandRows = 0;
    band.sections.forEach((section, si) => {
      const base = ['layout', 'bands', bi, 'sections', si];
      const resolved = {
        rows: section.rows ?? defaults?.rows,
        rowSpacing: section.rowSpacing ?? defaults?.rowSpacing,
        seatPitch: section.seatPitch ?? defaults?.seatPitch,
        seatType: section.seatType ?? defaults?.seatType,
      };
      for (const field of Object.keys(resolved) as (keyof typeof resolved)[]) {
        if (resolved[field] === undefined) add('schema.unresolved', base, { field });
      }
      if (section.seatType !== undefined && !seatTypeIds.has(section.seatType)) {
        add('schema.unknownSeatType', [...base, 'seatType'], { seatType: section.seatType });
      }
      const rows = resolved.rows;
      if (rows === undefined) return;
      bandRows = Math.max(bandRows, rows);
      const inRange = new Set<string>();
      (section.exclude ?? []).forEach((key, ei) => {
        const match = /^r(\d+)\.s(\d+)$/.exec(key);
        if (match && Number(match[1]) <= rows && Number(match[2]) <= section.seatsPerRow)
          inRange.add(key);
        else add('schema.excludeOutOfRange', [...base, 'exclude', ei], { key });
      });
      totalSeats += rows * section.seatsPerRow - inRange.size;
    });
    totalRows += bandRows;
  });

  const labels = config.layout.rowLabels;
  if (Array.isArray(labels) && labels.length < totalRows) {
    add('schema.rowLabelsTooShort', ['layout', 'rowLabels'], {
      rows: totalRows,
      labels: labels.length,
    });
  }
  if (totalSeats > LIMITS.maxSeatsTotal) {
    add('schema.tooManySeats', ['layout'], { count: totalSeats, max: LIMITS.maxSeatsTotal });
  }
  return issues;
}

/** Options for `serializeHallConfig`. */
export interface SerializeOptions {
  /** Output format. `yaml` is the default. */
  format?: 'yaml' | 'json';
  /** Original YAML: comments and key order are preserved where the values still exist. */
  source?: string;
}

/**
 * Writes a config as text. `format: 'json'` gives two-space JSON. Otherwise the output is YAML.
 * When `source` is given (the YAML the config was read from), the YAML keeps its comments and key
 * order for every value that still exists, and only changed values are rewritten. If `source` does
 * not parse, the YAML is written from scratch. Aliases are never written.
 *
 * @example
 * ```ts
 * const yaml = serializeHallConfig(config, { source: originalYaml });
 * ```
 */
export function serializeHallConfig(config: HallConfig, opts: SerializeOptions = {}): string {
  if (opts.format === 'json') return `${JSON.stringify(config, null, 2)}\n`;
  if (opts.source !== undefined) {
    const doc = parseDocument(opts.source, { uniqueKeys: true });
    if (doc.errors.length === 0) {
      doc.contents = reconcile(doc, doc.contents, config) as typeof doc.contents;
      return doc.toString({ lineWidth: 0 });
    }
  }
  return stringify(config, { lineWidth: 0, ...NO_ALIASES });
}

function yamlIdOf(item: unknown): string | undefined {
  if (!isMap(item)) return undefined;
  const id = item.get('id');
  return typeof id === 'string' ? id : undefined;
}

function idOfValue(item: unknown): string | undefined {
  return isPlainObject(item) && typeof item.id === 'string' ? item.id : undefined;
}

function idsUnique(ids: (string | undefined)[]): ids is string[] {
  return ids.every((id) => id !== undefined) && new Set(ids).size === ids.length;
}

/**
 * Returns the YAML node that should hold `value`, reusing `node` (and its comments) when possible.
 */
function reconcile(doc: Document, node: unknown, value: unknown): unknown {
  if (isNode(node) && deepEqual(node.toJSON(), value)) return node;
  if (isMap(node) && isPlainObject(value)) {
    syncMap(doc, node, value);
    return node;
  }
  if (isSeq(node) && Array.isArray(value)) {
    syncSeq(doc, node, value);
    return node;
  }
  const created = doc.createNode(value, NO_ALIASES);
  if (isNode(node)) {
    created.commentBefore = node.commentBefore;
    created.comment = node.comment;
  }
  return created;
}

/**
 * Lists of items with unique ids are matched by id; other lists are matched index by index, so
 * unchanged items keep their comments and only changed items and the tail are rewritten.
 */
function syncSeq(doc: Document, seq: YAMLSeq<unknown>, value: unknown[]): void {
  const valueIds = value.map(idOfValue);
  const nodeIds = seq.items.map(yamlIdOf);
  if (idsUnique(valueIds) && idsUnique(nodeIds)) {
    const byId = new Map<string, unknown>(
      nodeIds.map((id, i): [string, unknown] => [id, seq.items[i]]),
    );
    seq.items = valueIds.map((id, i) => reconcile(doc, byId.get(id), value[i]));
    return;
  }
  seq.items = value.map((item, i) => reconcile(doc, seq.items[i], item));
}

function keyOf(key: unknown): string {
  return typeof key === 'object' && key !== null && 'value' in key
    ? String(key.value)
    : String(key);
}

function syncMap(
  doc: Document,
  map: YAMLMap<unknown, unknown>,
  value: Record<string, unknown>,
): void {
  const keys = Object.keys(value).filter((key) => value[key] !== undefined);
  map.items = map.items.filter((pair) => keys.includes(keyOf(pair.key)));
  for (const pair of map.items) {
    const key = keyOf(pair.key);
    pair.value = reconcile(doc, pair.value, value[key]);
  }
  const present = new Set(map.items.map((pair) => keyOf(pair.key)));
  for (const key of keys) {
    if (!present.has(key)) map.items.push(doc.createPair(key, value[key], NO_ALIASES));
  }
}
