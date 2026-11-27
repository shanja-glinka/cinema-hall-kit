import { describe, expect, it } from 'vitest';
import { LIMITS } from '@cinema-hall/core';
import { createActions } from '../../src/constructor/editor/actions.js';
import { createEditorState } from '../../src/constructor/editor/state.js';
import { EditorStore } from '../../src/constructor/editor/store.js';
import { fixtureText, loadFixture } from './support.js';

function setup() {
  const store = new EditorStore(createEditorState(loadFixture()), () => undefined);
  return { store, actions: createActions(store) };
}

// A stored document can be larger than the upload limit, for example because of long comments.
const bigText = () =>
  `# Hall notes: ${'x'.repeat(LIMITS.maxBytes)}\n` +
  fixtureText.replace('name: Meridian Hall 3', 'name: Hall 4');

describe('editor.importText reading options', () => {
  it('keeps the default upload limit when no options are given', () => {
    const { store, actions } = setup();
    const before = store.state.config;
    const result = actions.importText(bigText());
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe('schema.tooLarge');
    expect(store.state.config).toBe(before);
  });

  it('accepts a larger document with maxBytes, and the export keeps its comments', () => {
    const { store, actions } = setup();
    const text = bigText();
    const result = actions.importText(text, { maxBytes: text.length * 2 });
    expect(result.ok).toBe(true);
    expect(store.state.config.name).toBe('Hall 4');
    expect(actions.exportYaml()).toContain('# Hall notes: xxx');
  });

  it('a smaller maxBytes refuses a document the default would accept', () => {
    const { actions } = setup();
    const result = actions.importText(fixtureText, { maxBytes: 10 });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe('schema.tooLarge');
  });
});
