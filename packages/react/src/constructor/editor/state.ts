import type { HallConfig } from '@cinema-hall/core';
import { sameConfig } from './config.js';
import type { RevisionToken } from './types.js';

/** Undo steps kept before the oldest one is dropped. */
export const HISTORY_LIMIT = 100;

/** A config with the YAML source it was edited from: history keeps both, so comments undo too. */
export interface EditorSnapshot {
  readonly config: HallConfig;
  readonly source: string | undefined;
}

/**
 * Reducer state of the editor: config, baseline, source, token and history.
 */
export interface EditorState {
  readonly config: HallConfig;
  readonly baseline: HallConfig;
  readonly source: string | undefined;
  /** The host's token of the baseline; `undefined` when the host set none. */
  readonly revision: RevisionToken | undefined;
  /** Oldest first. */
  readonly past: readonly EditorSnapshot[];
  readonly future: readonly EditorSnapshot[];
  /** Counts whole-config replacements: reset, template, import, undo and redo. */
  readonly generation: number;
}

/**
 * An action of the editor reducer.
 */
export type EditorAction =
  /**
   * An undoable change. `source`: a string replaces it, `null` clears it, `undefined` keeps it.
   * `replaced`: the whole hall was swapped (template, import), which starts a new generation.
   */
  | { type: 'commit'; config: HallConfig; source?: string | null; replaced?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'clearHistory' }
  | { type: 'markSaved'; baseline: HallConfig; revision?: RevisionToken }
  | { type: 'reset'; config: HallConfig; source?: string; revision?: RevisionToken };

/**
 * Creates a clean state.
 * @param config Initial hall.
 * @param source Original YAML.
 * @param revision Host revision token.
 * @returns The initial state.
 */
export function createEditorState(
  config: HallConfig,
  source?: string,
  revision?: RevisionToken,
): EditorState {
  return { config, baseline: config, source, revision, past: [], future: [], generation: 0 };
}

/**
 * Whether the config differs from the baseline.
 * @param state Editor state.
 * @returns True when there are unsaved changes.
 */
export function isDirty(state: EditorState): boolean {
  return !sameConfig(state.config, state.baseline);
}

function snapshotOf(state: EditorState): EditorSnapshot {
  return { config: state.config, source: state.source };
}

/**
 * Pure reducer. Every transition returns a new state; a change that alters nothing returns the same object.
 * @param state Current state.
 * @param action Action to apply.
 * @returns The next state.
 */
export function reduceEditor(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'commit': {
      const source = action.source === undefined ? state.source : (action.source ?? undefined);
      if (sameConfig(state.config, action.config) && source === state.source) {
        // A replacement that changes nothing still starts a new generation: a field keeps an unfinished
        // draft until the generation changes. It has no undo step, because nothing changed.
        return action.replaced ? { ...state, generation: state.generation + 1 } : state;
      }
      return {
        ...state,
        config: action.config,
        source,
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: [],
        generation: action.replaced ? state.generation + 1 : state.generation,
      };
    }
    case 'undo': {
      const previous = state.past[state.past.length - 1];
      if (previous === undefined) return state;
      return {
        ...state,
        config: previous.config,
        source: previous.source,
        past: state.past.slice(0, -1),
        future: [snapshotOf(state), ...state.future].slice(0, HISTORY_LIMIT),
        generation: state.generation + 1,
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (next === undefined) return state;
      return {
        ...state,
        config: next.config,
        source: next.source,
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        generation: state.generation + 1,
      };
    }
    case 'clearHistory':
      return { ...state, past: [], future: [] };
    case 'markSaved':
      return { ...state, baseline: action.baseline, revision: action.revision ?? state.revision };
    case 'reset':
      return {
        ...state,
        config: action.config,
        baseline: action.config,
        source: action.source ?? state.source,
        revision: action.revision ?? state.revision,
        past: [],
        future: [],
        generation: state.generation + 1,
      };
  }
}
