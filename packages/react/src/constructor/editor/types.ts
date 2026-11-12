import type {
  BandConfig,
  Constraints,
  FieldPolicy,
  HallConfig,
  HallLayout,
  Issue,
  IssueRef,
  ParseResult,
  SectionConfig,
  SeatTypeConfig,
  ValidateOptions,
  ValidationRule,
} from '@cinema-hall/core';

/** Deep partial of a config object. Arrays are replaced whole; an `undefined` value removes a key. */
export type DeepPatch<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPatch<T[K]> }
    : T;

/**
 * A deep patch of a hall config.
 */
export type ConfigPatch = DeepPatch<HallConfig>;

/**
 * The host's optimistic-locking token for a hall (an etag, a row version, …). The editor never reads
 * it: it keeps the latest one and passes it back to the host on save.
 */
export type RevisionToken = string | number;

/** Options of `markSaved`. */
export interface MarkSavedOptions {
  /** The token the host returned for the saved state. Omitted: the current token is kept. */
  revision?: RevisionToken;
}

/** Options of `reset`: the external baseline, with its YAML text and token when the host has them. */
export interface ResetOptions {
  /**
   * The YAML text of the new baseline: its comments and key order are kept by `exportYaml`. Omitted:
   * the current source is kept.
   */
  source?: string;
  /** The token of the new baseline. Omitted: the current token is kept. */
  revision?: RevisionToken;
}

/** A section inside a band, by stable ids (they survive reordering). */
export interface SectionRef {
  readonly bandId: string;
  readonly sectionId: string;
}

/** Either a stable reference (`{ sectionId }`) or a config path (`['hall', 'width']`). */
export type IssueTarget = IssueRef | readonly (string | number)[];

/**
 * Undo and redo of the editor.
 */
export interface EditorHistory {
  /** Returns the issues that rejected the step (empty = applied). A step the current policy forbids stays undone. */
  undo(): Issue[];
  redo(): Issue[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  clear(): void;
}

/**
 * Structural actions for bands; each returns the rejecting issues (empty = applied).
 */
export interface BandsApi {
  /** Adds a band with one section; `after` names the band to insert after (default: at the end). */
  add(opts?: { after?: string }): Issue[];
  remove(id: string): Issue[];
  move(id: string, toIndex: number): Issue[];
  duplicate(id: string): Issue[];
  patch(id: string, partial: DeepPatch<BandConfig>): Issue[];
}

/**
 * Structural actions for sections; each returns the rejecting issues (empty = applied).
 */
export interface SectionsApi {
  add(bandId: string, opts?: { after?: string } & Partial<SectionConfig>): Issue[];
  remove(ref: SectionRef): Issue[];
  move(ref: SectionRef, toIndex: number): Issue[];
  duplicate(ref: SectionRef): Issue[];
  patch(ref: SectionRef, partial: DeepPatch<SectionConfig>): Issue[];
}

/**
 * Actions for seat types; each returns the rejecting issues (empty = applied).
 */
export interface SeatTypesApi {
  add(id: string, def: SeatTypeConfig): Issue[];
  patch(id: string, partial: DeepPatch<SeatTypeConfig>): Issue[];
  /** Rejected while a band or section still refers to the seat type. */
  remove(id: string): Issue[];
}

/**
 * Options of `useHallEditor`.
 */
export interface UseHallEditorOptions {
  /**
   * A structurally valid config (`parseHallConfig` output or a template). Read once, on mount; an
   * invalid value throws, because there is no previous state to keep.
   */
  initial: HallConfig;
  /** The original YAML: its comments and key order survive `exportYaml`. */
  source?: string;
  /** Per-field access: `locked` and `hidden` fields reject edits, in the UI and in `importText`. */
  policy?: FieldPolicy;
  /**
   * The host's revision token of `initial` (an etag, a row version, …). Read once, on mount. The
   * editor keeps the latest token (`editor.revision`), passes it in `SaveContext.revision`, and adopts
   * the one a save or a `reset` returns.
   */
  revision?: RevisionToken;
  extraRules?: ValidationRule[];
  constraints?: Partial<Constraints>;
  severity?: ValidateOptions['severity'];
}

/**
 * The headless hall editor returned by `useHallEditor`.
 */
export interface HallEditor {
  /** Always structurally valid. */
  readonly config: HallConfig;
  /** The config last saved or loaded; `dirty` compares against it. */
  readonly baseline: HallConfig;
  /** The host's revision token of `baseline`; `undefined` when the host set none. */
  readonly revision: RevisionToken | undefined;
  /** Always present: `buildHallLayout` is total. */
  readonly layout: HallLayout;
  /** Semantic issues (`fit.*`, `rows.*`, `view.*`, custom rules) of the current config. */
  readonly issues: Issue[];
  issuesFor(target: IssueTarget): Issue[];
  readonly dirty: boolean;
  /**
   * Counts whole-config replacements (reset, template, import, undo, redo). Fields drop their
   * unfinished drafts when it changes; a save answer is scoped by `baseline` instead.
   */
  readonly generation: number;
  /** The field policy the editor enforces. */
  readonly policy: FieldPolicy;
  /**
   * Makes `baseline` (or the current config) the clean state, and adopts `opts.revision` when given.
   * An invalid baseline is rejected and changes nothing.
   */
  markSaved(baseline?: HallConfig, opts?: MarkSavedOptions): Issue[];
  readonly history: EditorHistory;
  /** Deep merge (arrays replaced). One undo step. Returns the issues that rejected it (empty = applied). */
  patch(patch: ConfigPatch): Issue[];
  readonly bands: BandsApi;
  readonly sections: SectionsApi;
  readonly seatTypes: SeatTypesApi;
  /** Several changes as one undo step. Returns the rejections made inside. */
  batch(fn: () => void): Issue[];
  /** Parses and replaces the config and the source. Structural and policy errors leave it unchanged. */
  importText(text: string): ParseResult;
  exportYaml(): string;
  /**
   * Makes `config` the new baseline and clears the history, and installs `opts.source` and
   * `opts.revision` when given. The check is structural only: a locked or hidden field may differ from
   * the previous baseline, because reset installs an external baseline (for example the server version
   * after a `conflict`). Rejected (state unchanged, issues returned) only when `config` is structurally
   * invalid. Inside `batch` it does nothing.
   */
  reset(config: HallConfig, opts?: ResetOptions): Issue[];
  /** Replaces the whole config as one undoable step and drops the YAML source (used by templates). */
  replace(config: HallConfig): Issue[];
}
