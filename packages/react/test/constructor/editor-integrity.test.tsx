import { useLayoutEffect } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseHallConfig, type FieldPolicy, type Issue } from '@cinema-hall/core';
import { useHallEditor } from '../../src/constructor/editor/use-hall-editor.js';
import { fixtureText, loadFixture } from './support.js';

const IMPORTED_NOTE = '# imported note';

/** The fixture with a comment that only an import can bring in. */
function importedText(): string {
  return fixtureText.replace('hall:', `${IMPORTED_NOTE}\nhall:`);
}

describe('F01: incoming configs are validated before they enter the state', () => {
  it('a reset to a structurally invalid hall is rejected and the state is kept', () => {
    const { result } = renderHook(() => useHallEditor({ initial: loadFixture() }));
    const broken = { ...loadFixture(), hall: { ...loadFixture().hall, width: Number.NaN } };
    let rejected: Issue[] = [];
    act(() => {
      rejected = result.current.reset(broken);
    });
    expect(rejected.length).toBeGreaterThan(0);
    expect(result.current.config.hall.width).toBe(14);
    expect(parseHallConfig(result.current.config).ok).toBe(true);
  });

  it('a reset installs an external baseline even when it differs in a locked field', () => {
    const { result } = renderHook(() =>
      useHallEditor({ initial: loadFixture(), policy: { 'hall.width': 'locked' } }),
    );
    const other = { ...loadFixture(), hall: { ...loadFixture().hall, width: 20 } };
    let rejected: Issue[] = [];
    act(() => {
      rejected = result.current.reset(other);
    });
    // reset is not a user edit (e.g. loading the server version after a conflict): no policy check.
    expect(rejected).toEqual([]);
    expect(result.current.config.hall.width).toBe(20);
    expect(result.current.dirty).toBe(false);
    // …but the user still cannot edit the locked field afterwards.
    let edit: Issue[] = [];
    act(() => {
      edit = result.current.patch({ hall: { width: 18 } });
    });
    expect(edit[0]?.code).toBe('field.locked');
    expect(result.current.config.hall.width).toBe(20);
  });

  it('a broken baseline given to markSaved is rejected and the dirty flag stays', () => {
    const { result } = renderHook(() => useHallEditor({ initial: loadFixture() }));
    act(() => {
      result.current.patch({ hall: { depth: 17 } });
    });
    const broken = { ...loadFixture(), hall: { ...loadFixture().hall, width: Number.NaN } };
    let rejected: Issue[] = [];
    act(() => {
      rejected = result.current.markSaved(broken);
    });
    expect(rejected.length).toBeGreaterThan(0);
    expect(result.current.dirty).toBe(true);
  });

  it('an invalid initial hall is reported on mount instead of entering the state', () => {
    const broken = { ...loadFixture(), hall: { ...loadFixture().hall, width: Number.NaN } };
    expect(() => renderHook(() => useHallEditor({ initial: broken }))).toThrow(
      /initial hall is invalid/,
    );
  });
});

describe('F02: the policy applies from the first action after mount', () => {
  it('a patch made in a layout effect is checked against the mounted policy', () => {
    let rejected: Issue[] | undefined;
    const { result } = renderHook(() => {
      const editor = useHallEditor({
        initial: loadFixture(),
        policy: { 'hall.width': 'locked' },
      });
      useLayoutEffect(() => {
        rejected = editor.patch({ hall: { width: 20 } });
      }, [editor]);
      return editor;
    });
    expect(rejected?.[0]?.code).toBe('field.locked');
    expect(result.current.config.hall.width).toBe(14);
  });
});

describe('F03: undo and redo are checked against the current policy', () => {
  it('an undo that would change a field now locked is rejected and nothing moves', () => {
    const fixture = loadFixture();
    const { result, rerender } = renderHook(
      ({ policy }: { policy: FieldPolicy }) => useHallEditor({ initial: fixture, policy }),
      { initialProps: { policy: {} } },
    );
    act(() => {
      result.current.patch({ hall: { width: 15 } });
    });
    rerender({ policy: { 'hall.width': 'locked' } });
    let rejected: Issue[] = [];
    act(() => {
      rejected = result.current.history.undo();
    });
    expect(rejected[0]?.code).toBe('field.locked');
    expect(result.current.config.hall.width).toBe(15);
    expect(result.current.history.canUndo).toBe(true);
  });
});

describe('F04: a batch keeps the source and the rejections of an import', () => {
  it('an import inside a batch keeps its comments, like an import outside one', () => {
    const { result } = renderHook(() =>
      useHallEditor({ initial: loadFixture(), source: fixtureText }),
    );
    act(() => {
      result.current.batch(() => {
        result.current.importText(importedText());
      });
    });
    expect(result.current.exportYaml()).toContain(IMPORTED_NOTE);
  });

  it('a rejected import inside a batch is returned by the batch', () => {
    const { result } = renderHook(() =>
      useHallEditor({ initial: loadFixture(), source: fixtureText }),
    );
    let rejected: Issue[] = [];
    act(() => {
      rejected = result.current.batch(() => {
        result.current.importText('not: [valid');
      });
    });
    expect(rejected.length).toBeGreaterThan(0);
    expect(result.current.dirty).toBe(false);
  });
});

describe('F05: history restores the YAML source with the config', () => {
  it('undoing an import brings back the comments of the document it replaced', () => {
    const { result } = renderHook(() =>
      useHallEditor({ initial: loadFixture(), source: fixtureText }),
    );
    act(() => {
      result.current.importText(importedText());
    });
    expect(result.current.exportYaml()).toContain(IMPORTED_NOTE);
    act(() => {
      result.current.history.undo();
    });
    expect(result.current.exportYaml()).not.toContain(IMPORTED_NOTE);
    expect(result.current.exportYaml()).toContain('Optional validation thresholds.');
  });

  it('applying a template clears the source as one undoable step', () => {
    const { result } = renderHook(() =>
      useHallEditor({ initial: loadFixture(), source: fixtureText }),
    );
    act(() => {
      result.current.replace(loadFixture());
    });
    expect(result.current.history.canUndo).toBe(true);
    expect(result.current.exportYaml()).not.toContain('Optional validation thresholds.');
    act(() => {
      result.current.history.undo();
    });
    expect(result.current.exportYaml()).toContain('Optional validation thresholds.');
  });
});
