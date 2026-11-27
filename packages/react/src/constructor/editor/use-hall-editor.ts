import { useCallback, useInsertionEffect, useMemo, useReducer, useState } from 'react';
import {
  buildHallLayout,
  parseHallConfig,
  validateHall,
  type FieldPolicy,
  type HallConfig,
  type Issue,
  type ValidateOptions,
} from '@cinema-hall/core';
import { createActions } from './actions.js';
import { issuesMatching } from './config.js';
import { createEditorState, isDirty, reduceEditor, type EditorState } from './state.js';
import { EditorStore } from './store.js';
import type { HallEditor, IssueTarget, RevisionToken, UseHallEditorOptions } from './types.js';

const NO_POLICY: FieldPolicy = {};

/** The store behind each editor this module made, so a save can read the newest state. */
const storeOf = new WeakMap<HallEditor, EditorStore>();

/**
 * The baseline and token of the newest state. A render can be older than the last action, because
 * React commits later: a save answer is checked against this, synchronously, not against the render.
 * @param editor Editor to read.
 * @returns The newest baseline and token.
 */
export function latestBaseline(editor: HallEditor): {
  baseline: HallConfig;
  revision: RevisionToken | undefined;
} {
  const store = storeOf.get(editor);
  if (store) return { baseline: store.state.baseline, revision: store.state.revision };
  return { baseline: editor.baseline, revision: editor.revision };
}

/**
 * The newest config, read without any serialization that could throw.
 * @param editor Editor to read.
 * @returns The config of the newest state.
 */
export function latestConfig(editor: HallEditor): HallConfig {
  const store = storeOf.get(editor);
  return store ? store.state.config : editor.config;
}

/**
 * The constraint overrides the editor validates with (`useHallEditor({ constraints })`).
 * @param editor Editor to read.
 * @returns The overrides, or undefined when there are none.
 */
export function editorConstraints(editor: HallEditor): ValidateOptions['constraints'] {
  return storeOf.get(editor)?.validateOptions.constraints;
}

/** A consistent view of the newest editor state, taken in one synchronous read. */
export interface SaveSnapshot {
  /** The newest config. */
  config: HallConfig;
  /** The newest baseline. */
  baseline: HallConfig;
  /** The newest revision token. */
  revision: RevisionToken | undefined;
  /** The YAML of `config`, with the source's comments. */
  yaml: string;
  /** The issues of `config`, judged with the editor's own rules and constraints. */
  issues: Issue[];
}

/**
 * Reads config, baseline, token, YAML and issues from the newest state in one go, so a save that
 * starts before React commits a reset or an edit still sends one consistent version.
 * @param editor Editor to read.
 * @returns The snapshot.
 */
export function latestSnapshot(editor: HallEditor): SaveSnapshot {
  const store = storeOf.get(editor);
  if (!store) {
    return {
      config: editor.config,
      baseline: editor.baseline,
      revision: editor.revision,
      yaml: editor.exportYaml(),
      issues: editor.issues,
    };
  }
  const { config, baseline, revision } = store.state;
  return {
    config,
    baseline,
    revision,
    yaml: store.exportYaml(),
    issues: validateHall(config, store.validateOptions),
  };
}

/** The first state. The hall must be structurally valid: a broken initial value is reported at once. */
function initialState(
  config: HallConfig,
  source: string | undefined,
  revision: RevisionToken | undefined,
): EditorState {
  const parsed = parseHallConfig(config);
  if (!parsed.ok) {
    const codes = parsed.issues.map((issue) => issue.code).join(', ');
    throw new Error(`useHallEditor: the initial hall is invalid (${codes}).`);
  }
  return createEditorState(parsed.config, source, revision);
}

/**
 * The headless hall editor. State lives in a reducer (`reduceEditor`); actions are checked
 * synchronously against the newest state, so they can report rejections immediately.
 * @param options Initial config, source, policy, revision and extra rules.
 * @returns The editor.
 * @example const editor = useHallEditor({ initial: config, revision: 3 });
 */
export function useHallEditor(options: UseHallEditorOptions): HallEditor {
  const { initial, source, policy, revision, extraRules, constraints, severity } = options;
  const [state, dispatch] = useReducer(reduceEditor, initial, (config: HallConfig) =>
    initialState(config, source, revision),
  );
  const effectivePolicy = policy ?? NO_POLICY;
  // The store holds the policy the actions enforce. The first render's policy is in place before the
  // first call, so that call is already checked; later commits replace it in a layout effect, so an
  // action kept from an older render checks the policy that is committed when it runs.
  const [store] = useState(() => {
    const created = new EditorStore(state, dispatch);
    created.setPolicy(effectivePolicy);
    created.setValidateOptions({ extraRules, constraints, severity });
    return created;
  });
  // An insertion effect runs before every layout effect of the same commit, children included: an
  // action taken by a child's layout effect already sees the committed policy and options.
  useInsertionEffect(() => {
    store.setPolicy(effectivePolicy);
    store.setValidateOptions({ extraRules, constraints, severity });
  }, [store, effectivePolicy, extraRules, constraints, severity]);
  const actions = useMemo(() => createActions(store), [store]);

  // The layout's balcony sizes come from the same constraints the issues are checked with.
  const layout = useMemo(
    () => buildHallLayout(state.config, { constraints }),
    [state.config, constraints],
  );
  const issues = useMemo(
    () => validateHall(state.config, { extraRules, constraints, severity }),
    [state.config, extraRules, constraints, severity],
  );
  const issuesFor = useCallback((target: IssueTarget) => issuesMatching(issues, target), [issues]);

  return useMemo<HallEditor>(() => {
    const editor: HallEditor = {
      config: state.config,
      baseline: state.baseline,
      revision: state.revision,
      layout,
      issues,
      issuesFor,
      dirty: isDirty(state),
      generation: state.generation,
      policy: effectivePolicy,
      markSaved: actions.markSaved,
      history: {
        undo: actions.undo,
        redo: actions.redo,
        canUndo: state.past.length > 0,
        canRedo: state.future.length > 0,
        clear: actions.clearHistory,
      },
      patch: actions.patch,
      bands: actions.bands,
      sections: actions.sections,
      seatTypes: actions.seatTypes,
      batch: actions.batch,
      importText: actions.importText,
      exportYaml: actions.exportYaml,
      reset: actions.reset,
      replace: actions.replace,
    };
    storeOf.set(editor, store);
    return editor;
  }, [state, layout, issues, issuesFor, actions, effectivePolicy, store]);
}
