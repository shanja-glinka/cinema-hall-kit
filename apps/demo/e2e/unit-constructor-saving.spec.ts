/** Saving in the constructor: one save at a time, the stored copy, the save dialog and drafts. No browser, no server. */
import { expect, test } from '@playwright/test';
import { parseHallConfig, templates, type HallConfig } from '@cinema-hall/core';
import { createHall, getHallResponse } from '../lib/server/halls';
import { db } from '../lib/server/store';
import { setTopLevelField } from '../lib/shared/hall-text';
import { createSaveGate, type SaveGateState } from '../lib/shared/save-gate';
import {
  adoptStoredHall,
  type AdoptingEditor,
  adoptSavedCopy,
  changesBetween,
} from '../lib/shared/saved-copy';
import { isCreateHallResponse } from '../lib/shared/types';
import type { ConfigPatch } from '@cinema-hall/react';
import { createHallScope } from '../lib/shared/hall-scope';
import { makeOthersInert, type InertNode } from '../lib/shared/modal';
import { MAX_STORED_YAML_BYTES, MAX_YAML_BYTES } from '../lib/server/body-limit';
import { restoreDraftText, type DraftTarget } from '../lib/shared/draft-restore';

const unique = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const kamerny = (): string => {
  const source = db().versions.get('kamerny-hall@1')?.source;
  if (!source) throw new Error('no sample hall');
  return source;
};

/** Taking the server copy of a hall that was just created, without losing edits made meanwhile. */

/** An editor stand-in that applies `reset`, `patch` and `replace` the simple way and records them. */
function fakeEditor(config: HallConfig, opts: { rejectPatch?: boolean } = {}) {
  const calls: string[] = [];
  const merge = (base: unknown, patch: unknown): unknown => {
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return patch;
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete out[key];
      else out[key] = merge(out[key], value);
    }
    return out;
  };
  const editor: Omit<AdoptingEditor, 'config'> & {
    config: HallConfig;
    source?: string;
    revision?: number;
    dirty: boolean;
  } = {
    config,
    dirty: true,
    reset(next, options) {
      calls.push('reset');
      editor.config = next;
      editor.source = options?.source;
      editor.revision = options?.revision as number;
      editor.dirty = false;
      return [];
    },
    patch(patch: ConfigPatch) {
      calls.push('patch');
      if (opts.rejectPatch)
        return [{ code: 'x', severity: 'error', path: [], params: {} }] as never;
      editor.config = merge(editor.config, patch) as HallConfig;
      editor.dirty = true;
      return [];
    },
    replace(next) {
      calls.push('replace');
      editor.config = next;
      editor.dirty = true;
      return [];
    },
  };
  return { editor, calls };
}

const base = (): HallConfig => templates.single();

test.describe('saving in the constructor, one save at a time', () => {
  test('Save as new cannot start while an update of the hall is on its way', () => {
    const states: SaveGateState[] = [];
    const gate = createSaveGate((state) => states.push(state));
    // The update takes the gate ...
    expect(gate.begin()).toBe(true);
    // ... so "Save as new hall" (and a second save) is refused until it ends.
    expect(gate.begin()).toBe(false);
    gate.end();
    expect(gate.begin()).toBe(true);
    gate.end();
    expect(states).toEqual(['busy', 'idle', 'busy', 'idle']);
  });

  test('a new hall that could not be opened blocks every further save', () => {
    const gate = createSaveGate();
    expect(gate.begin()).toBe(true);
    gate.block();
    gate.end();
    expect(gate.state).toBe('blocked');
    expect(gate.begin()).toBe(false);
  });

  test('the create answer carries the stored hall, the same as a later read', () => {
    const outcome = createHall({ yaml: kamerny(), name: unique('Stored'), asNew: true });
    if (!outcome.body.ok) throw new Error(outcome.body.message);
    expect(isCreateHallResponse(outcome.body)).toBe(true);
    expect(outcome.body.stored).toEqual(getHallResponse(outcome.body.hall.id));
    // An answer without it is not a create answer the constructor can switch to.
    const { stored: _stored, ...withoutStored } = outcome.body;
    expect(isCreateHallResponse(withoutStored)).toBe(false);
  });

  function fakeEditor(initial: Record<string, unknown>, rejects = false) {
    const calls: string[] = [];
    let config = initial;
    const editor: AdoptingEditor = {
      get config() {
        return config as never;
      },
      reset: (next, options) => {
        calls.push(`reset:${String(options?.revision)}`);
        if (rejects) return [{ severity: 'error', code: 'x', path: [] }] as never;
        config = next as never;
        return [];
      },
      patch: () => [],
      replace: (next) => {
        config = next as never;
        return [];
      },
    };
    return { editor, calls, current: () => config };
  }

  test('the editor takes the stored copy straight from the create answer', () => {
    const outcome = createHall({ yaml: kamerny(), name: unique('Adopt'), asNew: true });
    if (!outcome.body.ok) throw new Error(outcome.body.message);
    const original = parseHallConfig(kamerny(), { strict: true }).config;
    const { editor, current } = fakeEditor(original as never);
    expect(adoptStoredHall(editor, outcome.body.stored, original)).toBe(true);
    expect((current() as { id?: string }).id).toBe(outcome.body.hall.id);
  });

  test('when the editor cannot take the copy, the caller is told (and must block saves)', () => {
    const outcome = createHall({ yaml: kamerny(), name: unique('Refuse'), asNew: true });
    if (!outcome.body.ok) throw new Error(outcome.body.message);
    const original = parseHallConfig(kamerny(), { strict: true }).config;
    const { editor, current } = fakeEditor(original as never, true);
    expect(adoptStoredHall(editor, outcome.body.stored, original)).toBe(false);
    expect(current()).toBe(original);
    const broken = { ...outcome.body.stored, config: { nonsense: true } as never };
    expect(adoptStoredHall(fakeEditor(original as never).editor, broken, original)).toBe(false);
  });
});

test.describe('the server copy after a save', () => {
  test('without edits during the save, the server copy is taken as it is', () => {
    const sent = base();
    const server: HallConfig = { ...sent, id: 'new-hall' };
    const { editor, calls } = fakeEditor(sent);
    expect(adoptSavedCopy(editor, server, { source: '# s', revision: 1 }, sent)).toBe(false);
    expect(calls).toEqual(['reset']);
    expect(editor.config).toBe(server);
    expect(editor.dirty).toBe(false);
    expect(editor.source).toBe('# s');
  });

  test('a name typed while the save ran stays, on top of the id the server gave', () => {
    const sent = base();
    const server: HallConfig = { ...sent, id: 'new-hall', name: 'Saved name' };
    const { editor } = fakeEditor({ ...sent, name: 'Typed meanwhile' });
    expect(adoptSavedCopy(editor, server, { source: '# s', revision: 1 }, sent)).toBe(true);
    expect(editor.config.name).toBe('Typed meanwhile');
    expect(editor.config.id).toBe('new-hall');
    expect(editor.revision).toBe(1);
    expect(editor.dirty).toBe(true);
  });

  test('nested edits and removed keys are kept; a server name is kept when the user left it', () => {
    const sent: HallConfig = { ...base(), meta: { hallType: '2D', note: 'x' } };
    const current: HallConfig = {
      ...sent,
      hall: { ...sent.hall, width: sent.hall.width + 1 },
      meta: { hallType: '2D' },
    };
    const patch = changesBetween(sent, current);
    expect(patch).toEqual({ hall: { width: sent.hall.width + 1 }, meta: { note: undefined } });
    expect(changesBetween(sent, { ...sent })).toBeNull();
    const server: HallConfig = { ...sent, id: 'h', name: 'Server name' };
    const { editor } = fakeEditor(current);
    adoptSavedCopy(editor, server, { source: '', revision: 2 }, sent);
    expect(editor.config.hall.width).toBe(sent.hall.width + 1);
    expect(editor.config.meta).toEqual({ hallType: '2D' });
    expect(editor.config.name).toBe('Server name');
    expect(editor.config.id).toBe('h');
  });

  test('edits that do not apply on the server copy are kept whole under the new id', () => {
    const sent = base();
    const { editor, calls } = fakeEditor({ ...sent, name: 'Typed' }, { rejectPatch: true });
    adoptSavedCopy(editor, { ...sent, id: 'new-hall' }, { source: '', revision: 1 }, sent);
    expect(calls).toEqual(['reset', 'patch', 'replace']);
    expect(editor.config).toMatchObject({ id: 'new-hall', name: 'Typed' });
  });
});

test.describe('answers for the hall the constructor has left are dropped', () => {
  test('after "Save as new hall" only the new hall owns the answers', () => {
    const scope = createHallScope('orbita-hall-2');
    expect(scope.owns('orbita-hall-2')).toBe(true);
    // A showtime refresh for the original is still in flight when the copy is saved.
    const asked = scope.current;
    scope.set('orbita-hall-2-copy');
    expect(scope.owns(asked)).toBe(false);
    expect(scope.owns('orbita-hall-2-copy')).toBe(true);
    expect(createHallScope(null).owns(null)).toBe(true);
  });
});

test.describe('the page behind the save dialog is inert while it is open', () => {
  interface FakeElement extends InertNode {
    name: string;
    inert: boolean;
    parentElement: FakeElement | null;
    children: FakeElement[];
  }
  const element = (name: string, children: FakeElement[] = [], inert = false): FakeElement => {
    const node: FakeElement = { name, inert, parentElement: null, children };
    for (const child of children) child.parentElement = node;
    return node;
  };

  test('everything outside the dialog is made inert, and only that is undone', () => {
    const dialog = element('dialog', [element('input')]);
    const toolbar = element('toolbar', [element('save')]);
    const already = element('already', [], true);
    const main = element('main', [element('header'), toolbar, dialog]);
    const nav = element('nav');
    // A text node has no `inert` and is skipped.
    const body = element('body', [nav, main, already]);
    const svg = { parentElement: body, children: [] } as unknown as FakeElement;
    body.children.push(svg);
    const html = element('html', [element('head'), body]);
    const restore = makeOthersInert(dialog);
    const inertNames = (node: FakeElement): string[] => [
      ...(node.inert ? [node.name] : []),
      ...node.children.flatMap(inertNames),
    ];
    expect(inertNames(html).sort()).toEqual(['already', 'head', 'header', 'nav', 'toolbar'].sort());
    expect(dialog.inert).toBe(false);
    restore();
    expect(inertNames(html)).toEqual(['already']);
  });
});

test.describe('drafts of a hall at the stored limit', () => {
  /** An editor that imports like the library's `importText`: it keeps the text it imported. */
  const fakeEditor = (): DraftTarget & { config: HallConfig | null; source: string | null } => {
    const editor: DraftTarget & { config: HallConfig | null; source: string | null } = {
      config: null,
      source: null,
      importText: (text, opts) => {
        const parsed = parseHallConfig(text, opts);
        if (parsed.ok) {
          editor.config = parsed.config;
          editor.source = text;
        }
        return parsed;
      },
    };
    return editor;
  };
  const kamerny = (): string => {
    const source = db().versions.get('kamerny-hall@1')?.source;
    if (!source) throw new Error('no sample hall');
    return source;
  };

  test('the draft of a stored hall over 256 KiB is restored with its comments, not deleted', () => {
    const name = unique('Draft limit hall');
    const base = setTopLevelField(setTopLevelField(kamerny(), 'id', undefined), 'name', name);
    const yaml = base + '\n'.repeat(MAX_YAML_BYTES - Buffer.byteLength(base));
    const outcome = createHall({ yaml });
    if (!outcome.body.ok) throw new Error(outcome.body.message);
    const stored = outcome.body.stored.source;
    expect(Buffer.byteLength(stored)).toBeGreaterThan(MAX_YAML_BYTES);
    // An unsaved edit of that hall, as the constructor keeps it.
    const draft = setTopLevelField(stored, 'name', `${name} edited`);

    // The import with the default limit refuses it (this deleted the draft before the first fix).
    expect(fakeEditor().importText(draft).ok).toBe(false);
    const editor = fakeEditor();
    const result = restoreDraftText(editor, draft);
    expect(result.ok).toBe(true);
    expect(editor.config?.name).toBe(`${name} edited`);
    // Read through the import with the stored-text limit, so the text and its comments are kept.
    expect(editor.source).toBe(draft);
    expect(editor.source).toContain('# Units:');
  });

  test('every draft goes through the import; one over the stored limit is refused', () => {
    const editor = fakeEditor();
    const limits: (number | undefined)[] = [];
    const counting: DraftTarget = {
      importText: (text, opts) => {
        limits.push(opts?.maxBytes);
        return editor.importText(text, opts);
      },
    };
    expect(restoreDraftText(counting, kamerny()).ok).toBe(true);
    const huge = kamerny() + '\n'.repeat(MAX_STORED_YAML_BYTES);
    expect(restoreDraftText(counting, huge).ok).toBe(false);
    expect(limits).toEqual([MAX_STORED_YAML_BYTES, MAX_STORED_YAML_BYTES]);
  });
});
