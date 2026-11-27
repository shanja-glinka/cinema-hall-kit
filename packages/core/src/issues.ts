/**
 * Validation issues: a wire format without human text. Text is produced by `formatIssue`
 * so that every UI and server can localise it.
 */

/**
 * `error` marks a problem in the config, such as a hall that does not fit, a broken reference or a
 * syntax error. `warning` marks a comfort or consistency concern that does not stop the config from
 * being used. `hasErrors` looks only at `error`.
 */
export type IssueSeverity = 'error' | 'warning';

/**
 * Every issue code the library reports. Codes starting with `schema.` are structural (the config
 * did not parse or failed the schema). The others are semantic: the config parsed and was checked
 * against the geometry, comfort, view and pricing rules.
 */
export const BUILT_IN_ISSUE_CODES = [
  // structural (parse fails)
  'schema.syntax',
  'schema.tooLarge',
  'schema.unsupportedVersion',
  'schema.invalidType',
  'schema.invalidValue',
  'schema.unknownKey',
  'schema.required',
  'schema.tooSmall',
  'schema.tooBig',
  'schema.invalidFormat',
  'schema.duplicateId',
  'schema.unknownSeatType',
  'schema.unresolved',
  'schema.excludeOutOfRange',
  'schema.tooManySeats',
  'schema.tooManySections',
  'schema.rowLabelsTooShort',
  // semantic (parse succeeds)
  'fit.width',
  'fit.depth',
  'fit.screenWidth',
  'fit.screenHeight',
  'fit.headroom',
  'rows.legroom',
  'rows.pitch',
  'layout.aisle',
  'layout.bandOverlap',
  'view.firstRowTooClose',
  'view.frontRowVertical',
  'view.sightline',
  'view.overhang',
  'pricing.missingTier',
  'field.locked',
] as const;

/** One of `BUILT_IN_ISSUE_CODES`. */
export type BuiltInIssueCode = (typeof BUILT_IN_ISSUE_CODES)[number];
/** Built-in codes keep autocompletion; custom rules may use any string. */
export type IssueCode = BuiltInIssueCode | (string & {});

/**
 * Stable reference to the band, section or seat type that an issue is about. It uses ids rather
 * than indexes, so it still points at the right place after bands or sections are reordered.
 */
export interface IssueRef {
  /** Id of the band involved. */
  bandId?: string;
  /** Id of the section involved. */
  sectionId?: string;
  /** Id of the seat type involved. */
  seatTypeId?: string;
}

/**
 * A problem found in a config. It carries codes and values, not text: use `formatIssue` to turn it
 * into a message for a locale.
 */
export interface Issue {
  /** `error` or `warning`. */
  severity: IssueSeverity;
  /**
   * Stable code, for example `fit.width`. Built-in codes are listed in `BUILT_IN_ISSUE_CODES`.
   * Custom rules may use their own codes.
   */
  code: IssueCode;
  /** Path inside the config, e.g. `['layout', 'bands', 0, 'sections', 1, 'seatsPerRow']`. */
  path: (string | number)[];
  /** Stable reference that survives reordering of bands and sections. */
  ref?: IssueRef;
  /** Values for message templates (numbers are metres or degrees). */
  params?: Record<string, string | number>;
  /** 1-based position in the source text for syntax errors. */
  position?: { line: number; col: number };
}

/** Prefix of every structural issue code: the config did not parse or failed the schema. */
export const STRUCTURAL_ISSUE_PREFIX = 'schema.';

/** True for a structural issue (its code starts with `schema.`). False for a semantic issue. */
export function isStructuralIssue(issue: Issue): boolean {
  return issue.code.startsWith(STRUCTURAL_ISSUE_PREFIX);
}

/** True when at least one issue has severity `error`. Warnings alone return false. */
export function hasErrors(issues: readonly Issue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

/** `['layout','bands',0]` → `layout.bands[0]` (for logs and keys, not for users). */
export function pathToString(path: readonly (string | number)[]): string {
  return path.reduce<string>(
    (acc, part) => (typeof part === 'number' ? `${acc}[${part}]` : acc ? `${acc}.${part}` : part),
    '',
  );
}
