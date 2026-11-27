import { parseHallConfig, type HallConfig, type Issue, type ParseResult } from '@cinema-hall/core';
import { applyPatch } from './config.js';
import { addBand, duplicateBand, moveBand, patchBand, removeBand } from './bands.js';
import {
  addSection,
  duplicateSection,
  moveSection,
  patchSection,
  removeSection,
} from './sections.js';
import { addSeatType, patchSeatType, removeSeatType, renameSeatType } from './seat-types.js';
import type {
  BandsApi,
  ConfigPatch,
  ImportTextOptions,
  MarkSavedOptions,
  ResetOptions,
  SectionsApi,
  SeatTypesApi,
} from './types.js';
import type { ChangeOptions, EditorStore } from './store.js';
import { checkCandidate, policyIssues } from './transition.js';

/**
 * The structural actions of the editor, checked against the newest state.
 */
export interface EditorActions {
  patch: (patch: ConfigPatch) => Issue[];
  bands: BandsApi;
  sections: SectionsApi;
  seatTypes: SeatTypesApi;
  batch: (fn: () => void) => Issue[];
  replace: (config: HallConfig) => Issue[];
  importText: (text: string, opts?: ImportTextOptions) => ParseResult;
  exportYaml: () => string;
  reset: (config: HallConfig, opts?: ResetOptions) => Issue[];
  markSaved: (baseline?: HallConfig, opts?: MarkSavedOptions) => Issue[];
  undo: () => Issue[];
  redo: () => Issue[];
  clearHistory: () => void;
}

/**
 * The public editor actions, bound to one store. Every action reads the field policy of the store when
 * it runs, not when it was created: an action kept from an earlier render checks the committed policy.
 * Each returns the issues that rejected it (empty = applied).
 * @param store Editor store.
 * @returns The actions bound to the store.
 */
export function createActions(store: EditorStore): EditorActions {
  const apply = (build: (config: HallConfig) => unknown, change?: ChangeOptions): Issue[] =>
    store.apply(build, change);

  /** Undo and redo are edits too: the policy checks them before the state moves. */
  const travel = (target: HallConfig | undefined, direction: 'undo' | 'redo'): Issue[] => {
    if (store.inBatch || target === undefined) return [];
    const result = checkCandidate(store.state.config, target, store.policy);
    if (result.issues.length > 0) return result.issues;
    store.dispatch({ type: direction });
    return [];
  };

  return {
    patch: (patch) => apply((config) => applyPatch(config, patch)),
    bands: {
      add: (opts) =>
        apply((config) =>
          addBand(config, opts, { constraints: store.validateOptions.constraints }),
        ),
      remove: (id) => apply((config) => removeBand(config, id)),
      move: (id, toIndex) => apply((config) => moveBand(config, id, toIndex)),
      duplicate: (id) => apply((config) => duplicateBand(config, id)),
      patch: (id, partial) => apply((config) => patchBand(config, id, partial)),
    },
    sections: {
      add: (bandId, opts = {}) =>
        apply((config) =>
          addSection(config, bandId, opts, { constraints: store.validateOptions.constraints }),
        ),
      remove: (ref) => apply((config) => removeSection(config, ref)),
      move: (ref, toIndex) => apply((config) => moveSection(config, ref, toIndex)),
      duplicate: (ref) => apply((config) => duplicateSection(config, ref)),
      patch: (ref, partial) => apply((config) => patchSection(config, ref, partial)),
    },
    seatTypes: {
      add: (id, def) => apply((config) => addSeatType(config, id, def)),
      patch: (id, partial) => apply((config) => patchSeatType(config, id, partial)),
      remove: (id) => apply((config) => removeSeatType(config, id)),
      rename: (id, nextId) => apply((config) => renameSeatType(config, id, nextId)),
    },
    batch: (fn) => store.batch(fn),
    replace: (config) => apply(() => config, { source: null, replaced: true }),
    importText: (text, opts) => {
      // Only the reading options are passed on: `strict` would throw instead of returning issues.
      const parsed = parseHallConfig(text, { format: opts?.format, maxBytes: opts?.maxBytes });
      if (!parsed.ok) return { ok: false, issues: store.reject(parsed.issues) };
      const access = policyIssues(store.read(), parsed.config, store.policy);
      if (access.length > 0) return { ok: false, issues: store.reject(access) };
      store.write(parsed.config, { source: text, replaced: true });
      return parsed;
    },
    exportYaml: () => store.exportYaml(),
    reset: (config, opts) => {
      if (store.inBatch) return [];
      // reset installs an external baseline (e.g. the server version after a conflict); it is not a
      // user edit, so the field policy does not apply — only structural validity does.
      const parsed = parseHallConfig(config);
      if (!parsed.ok) return parsed.issues;
      store.dispatch({
        type: 'reset',
        config: parsed.config,
        source: opts?.source,
        revision: opts?.revision,
      });
      return [];
    },
    markSaved: (baseline, opts) => {
      if (baseline === undefined) {
        store.dispatch({
          type: 'markSaved',
          baseline: store.state.config,
          revision: opts?.revision,
        });
        return [];
      }
      const parsed = parseHallConfig(baseline);
      if (!parsed.ok) return parsed.issues;
      store.dispatch({ type: 'markSaved', baseline: parsed.config, revision: opts?.revision });
      return [];
    },
    undo: () => travel(store.state.past[store.state.past.length - 1]?.config, 'undo'),
    redo: () => travel(store.state.future[0]?.config, 'redo'),
    clearHistory: () => {
      if (!store.inBatch) store.dispatch({ type: 'clearHistory' });
    },
  };
}
