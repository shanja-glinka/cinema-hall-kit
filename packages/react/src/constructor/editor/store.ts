import {
  serializeHallConfig,
  type FieldPolicy,
  type HallConfig,
  type Issue,
  type ValidateOptions,
} from '@cinema-hall/core';
import { reduceEditor, type EditorAction, type EditorState } from './state.js';
import { transition } from './transition.js';

/** How a change touches the YAML source: a string replaces it, `null` clears it, `undefined` keeps it. */
export interface ChangeOptions {
  source?: string | null;
  /** The whole hall was swapped (template, import): field drafts are dropped. */
  replaced?: boolean;
}

interface BatchSession {
  draft: HallConfig;
  source: string | null | undefined;
  replaced: boolean;
  touched: boolean;
  rejected: Issue[];
}

/**
 * Keeps the newest editor state synchronously, so an action can be checked and answered at once
 * (React applies the same actions later, through the same pure reducer). Inside `batch` the
 * changes accumulate in a draft, with their source, and reach the reducer as one commit.
 */
export class EditorStore {
  private latest: EditorState;
  private session: BatchSession | null = null;
  private policyValue: FieldPolicy = {};
  private validateValue: ValidateOptions = {};
  private readonly send: (action: EditorAction) => void;

  constructor(initial: EditorState, send: (action: EditorAction) => void) {
    this.latest = initial;
    this.send = send;
  }

  get state(): EditorState {
    return this.latest;
  }

  /** The field policy the actions enforce. They read it when they run, so a kept action checks the committed one. */
  get policy(): FieldPolicy {
    return this.policyValue;
  }

  setPolicy(policy: FieldPolicy): void {
    this.policyValue = policy;
  }

  /** The validation options of the editor (constraints, extra rules, severity). */
  get validateOptions(): ValidateOptions {
    return this.validateValue;
  }

  setValidateOptions(options: ValidateOptions): void {
    this.validateValue = options;
  }

  get inBatch(): boolean {
    return this.session !== null;
  }

  /** The config an action starts from: the batch draft while batching, otherwise the latest config. */
  read(): HallConfig {
    return this.session?.draft ?? this.latest.config;
  }

  dispatch(action: EditorAction): void {
    this.latest = reduceEditor(this.latest, action);
    this.send(action);
  }

  /** Stages a candidate in the open batch, or commits it as one undoable step. */
  write(config: HallConfig, change: ChangeOptions = {}): void {
    const session = this.session;
    if (session) {
      session.draft = config;
      if (change.source !== undefined) session.source = change.source;
      if (change.replaced) session.replaced = true;
      session.touched = true;
      return;
    }
    this.dispatch({ type: 'commit', config, source: change.source, replaced: change.replaced });
  }

  /** Records rejections made inside a batch, and returns them. */
  reject(issues: Issue[]): Issue[] {
    this.session?.rejected.push(...issues);
    return issues;
  }

  /** Runs a transition on the current config; applies it when it passes and returns the rejections. */
  apply(build: (config: HallConfig) => unknown, change: ChangeOptions = {}): Issue[] {
    const result = transition(this.read(), this.policyValue, build);
    if (result.issues.length > 0) return this.reject(result.issues);
    this.write(result.config, change);
    return [];
  }

  batch(fn: () => void): Issue[] {
    const outer = this.session;
    if (outer) {
      const from = outer.rejected.length;
      fn();
      return outer.rejected.slice(from);
    }
    const session: BatchSession = {
      draft: this.latest.config,
      source: undefined,
      replaced: false,
      touched: false,
      rejected: [],
    };
    this.session = session;
    try {
      fn();
    } catch (error) {
      this.session = null;
      throw error;
    }
    this.session = null;
    if (session.touched) {
      this.dispatch({
        type: 'commit',
        config: session.draft,
        source: session.source,
        replaced: session.replaced,
      });
    }
    return session.rejected;
  }

  exportYaml(): string {
    return serializeHallConfig(this.latest.config, { source: this.latest.source });
  }
}
