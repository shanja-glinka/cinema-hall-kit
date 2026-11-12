import { describe, expect, it } from 'vitest';
import { sameConfig } from '../../src/constructor/editor/config.js';
import { applyPatch, uniqueId } from '../../src/constructor/editor/config.js';
import { createActions } from '../../src/constructor/editor/actions.js';
import { createEditorState, HISTORY_LIMIT, isDirty } from '../../src/constructor/editor/state.js';
import { EditorStore } from '../../src/constructor/editor/store.js';
import type { FieldPolicy } from '@cinema-hall/core';
import { fixtureText, loadFixture } from './support.js';

function setup(policy: FieldPolicy = {}, source?: string) {
  const store = new EditorStore(createEditorState(loadFixture(), source), () => undefined);
  store.setPolicy(policy);
  return { store, actions: createActions(store) };
}

function sectionIds(store: EditorStore, bandIndex = 0): string[] {
  return (store.state.config.layout.bands[bandIndex]?.sections ?? []).map((section) => section.id);
}

describe('patch helpers', () => {
  it('deep-merges objects, replaces arrays and removes undefined keys', () => {
    expect(applyPatch({ a: { b: 1, c: 2 }, list: [1, 2] }, { a: { b: 5 }, list: [3] })).toEqual({
      a: { b: 5, c: 2 },
      list: [3],
    });
    expect(applyPatch({ a: 1, b: 2 }, { a: undefined })).toEqual({ b: 2 });
  });

  it('uniqueId returns the base first, then numbered ids', () => {
    expect(uniqueId('section', new Set())).toBe('section');
    expect(uniqueId('section', new Set(['section']))).toBe('section-2');
    expect(uniqueId('section', new Set(['section', 'section-2']))).toBe('section-3');
  });
});

describe('editor transitions', () => {
  it('a patch is one undo step, and undo restores the previous config', () => {
    const { store, actions } = setup();
    const before = store.state.config;
    expect(actions.patch({ hall: { width: 15 } })).toEqual([]);
    expect(store.state.config.hall.width).toBe(15);
    expect(isDirty(store.state)).toBe(true);
    actions.undo();
    expect(sameConfig(store.state.config, before)).toBe(true);
    expect(isDirty(store.state)).toBe(false);
  });

  it('a structurally invalid patch is rejected with an issue and nothing changes', () => {
    const { store, actions } = setup();
    const issues = actions.sections.patch(
      { bandId: 'main', sectionId: 'centre' },
      { seatsPerRow: 0 },
    );
    expect(issues[0]?.code).toBe('schema.tooSmall');
    expect(store.state.past).toHaveLength(0);
    expect(store.state.config.layout.bands[0]?.sections[1]?.seatsPerRow).toBe(8);
  });

  it('sections.add gives readable unique ids and inserts after the given section', () => {
    const { store, actions } = setup();
    expect(actions.sections.add('main', { after: 'left' })).toEqual([]);
    expect(sectionIds(store)).toEqual(['left', 'section-7', 'centre', 'right']);
    expect(actions.sections.add('main', {})).toEqual([]);
    expect(sectionIds(store)).toContain('section-8');
  });

  it('sections.duplicate and bands.duplicate place -copy ids next to the original', () => {
    const { store, actions } = setup();
    expect(actions.sections.duplicate({ bandId: 'main', sectionId: 'centre' })).toEqual([]);
    expect(sectionIds(store)).toEqual(['left', 'centre', 'centre-copy', 'right']);
    expect(actions.bands.duplicate('recliners')).toEqual([]);
    expect(store.state.config.layout.bands.map((band) => band.id)).toEqual([
      'main',
      'recliners',
      'recliners-copy',
    ]);
    expect(store.state.config.layout.bands[2]?.sections.map((s) => s.id)).toEqual([
      'rec-left-copy',
      'rec-centre-copy',
      'rec-right-copy',
    ]);
  });

  it('sections.move reorders inside the band', () => {
    const { store, actions } = setup();
    expect(actions.sections.move({ bandId: 'main', sectionId: 'left' }, 2)).toEqual([]);
    expect(sectionIds(store)).toEqual(['centre', 'right', 'left']);
  });

  it('removing the last band is rejected: a hall keeps at least one band', () => {
    const { store, actions } = setup();
    expect(actions.bands.remove('recliners')).toEqual([]);
    const issues = actions.bands.remove('main');
    expect(issues[0]?.code).toBe('schema.tooSmall');
    expect(store.state.config.layout.bands.map((band) => band.id)).toEqual(['main']);
  });

  it('removing a seat type that is still used is rejected with an issue', () => {
    const { store, actions } = setup();
    const issues = actions.seatTypes.remove('standard');
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.code).toBe('schema.unknownSeatType');
    expect(store.state.config.seatTypes).toHaveProperty('standard');
  });

  it('seatTypes.add rejects an id that already exists', () => {
    const { actions } = setup();
    const issues = actions.seatTypes.add('standard', {
      label: 'Again',
      width: 0.5,
      depth: 0.5,
      color: '#000000',
    });
    expect(issues[0]?.code).toBe('schema.duplicateId');
  });

  it('a locked field rejects a change, and the rejection names the field', () => {
    const { store, actions } = setup({ 'hall.width': 'locked' });
    const issues = actions.patch({ hall: { width: 20 } });
    expect(issues[0]?.code).toBe('field.locked');
    expect(store.state.config.hall.width).toBe(14);
  });

  it('batch applies several changes as one undo step and returns the rejections inside', () => {
    const { store, actions } = setup();
    const rejected = actions.batch(() => {
      actions.patch({ hall: { width: 15 } });
      actions.patch({ hall: { depth: -1 } });
      actions.patch({ hall: { height: 9 } });
    });
    expect(rejected.length).toBeGreaterThan(0);
    expect(store.state.config.hall.width).toBe(15);
    expect(store.state.config.hall.height).toBe(9);
    expect(store.state.config.hall.depth).toBe(16);
    expect(store.state.past).toHaveLength(1);
    actions.undo();
    expect(store.state.config.hall.width).toBe(14);
    expect(store.state.config.hall.height).toBe(8);
  });

  it('a batch that throws leaves the config unchanged', () => {
    const { store, actions } = setup();
    expect(() =>
      actions.batch(() => {
        actions.patch({ hall: { width: 15 } });
        throw new Error('stop');
      }),
    ).toThrow('stop');
    expect(store.state.config.hall.width).toBe(14);
  });

  it('history keeps at most HISTORY_LIMIT steps', () => {
    const { store, actions } = setup();
    for (let step = 0; step < HISTORY_LIMIT + 5; step += 1) {
      actions.patch({ hall: { width: 10 + step / 1000 } });
    }
    expect(store.state.past).toHaveLength(HISTORY_LIMIT);
  });

  it('markSaved clears dirty, and reset makes a new baseline without history', () => {
    const { store, actions } = setup();
    actions.patch({ hall: { width: 15 } });
    actions.markSaved();
    expect(isDirty(store.state)).toBe(false);
    actions.patch({ hall: { width: 16 } });
    actions.reset(loadFixture());
    expect(isDirty(store.state)).toBe(false);
    expect(store.state.past).toHaveLength(0);
  });
});

describe('import and export', () => {
  it('importText reports a syntax error with its line and column', () => {
    const { actions } = setup();
    const result = actions.importText('version: 1\nname: [unclosed\n');
    expect(result.ok).toBe(false);
    const position = result.issues[0]?.position;
    expect(position?.line).toBeGreaterThan(0);
    expect(position?.col).toBeGreaterThan(0);
  });

  it('importText applies valid text, and the export then keeps its comments', () => {
    const { store, actions } = setup();
    const result = actions.importText(fixtureText.replace('name: Meridian Hall 3', 'name: Hall 4'));
    expect(result.ok).toBe(true);
    expect(store.state.config.name).toBe('Hall 4');
    expect(actions.exportYaml()).toContain('# Interior hall dimensions');
  });

  it('importText refuses text that changes a locked field and changes nothing', () => {
    const { store, actions } = setup({ name: 'locked' });
    const result = actions.importText(fixtureText.replace('name: Meridian Hall 3', 'name: Hall X'));
    expect(result.ok).toBe(false);
    expect(store.state.config.name).toBe('Meridian Hall 3');
  });

  it('exportYaml keeps the source comments after an edit', () => {
    const { actions } = setup({}, fixtureText);
    actions.patch({ hall: { width: 15 } });
    const yaml = actions.exportYaml();
    expect(yaml).toContain('# Interior hall dimensions');
    expect(yaml).toContain('width: 15');
  });
});

describe('redo', () => {
  it('redo re-applies an undone change, and a new change clears the redo steps', () => {
    const { store, actions } = setup();
    actions.patch({ hall: { width: 15 } });
    actions.undo();
    expect(store.state.future).toHaveLength(1);
    actions.redo();
    expect(store.state.config.hall.width).toBe(15);
    actions.undo();
    actions.patch({ hall: { width: 16 } });
    expect(store.state.future).toHaveLength(0);
  });
});
