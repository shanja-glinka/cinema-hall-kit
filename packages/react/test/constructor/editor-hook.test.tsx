import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FieldPolicy, Issue } from '@cinema-hall/core';
import { useHallEditor } from '../../src/constructor/editor/use-hall-editor.js';
import { fixtureText, loadFixture } from './support.js';

describe('useHallEditor', () => {
  it('exposes layout and issues, rejects invalid actions at once, and undoes to clean', () => {
    const { result } = renderHook(() =>
      useHallEditor({ initial: loadFixture(), source: fixtureText }),
    );
    expect(result.current.layout.seats.length).toBeGreaterThan(0);
    expect(result.current.dirty).toBe(false);

    let rejected: Issue[] = [];
    act(() => {
      rejected = result.current.sections.patch(
        { bandId: 'main', sectionId: 'centre' },
        { seatsPerRow: 0 },
      );
    });
    expect(rejected.length).toBeGreaterThan(0);
    expect(result.current.dirty).toBe(false);

    act(() => {
      result.current.patch({ hall: { width: 10 } });
    });
    expect(result.current.issues.some((issue) => issue.code === 'fit.width')).toBe(true);
    expect(result.current.dirty).toBe(true);
    expect(result.current.history.canUndo).toBe(true);

    act(() => {
      result.current.history.undo();
    });
    expect(result.current.config.hall.width).toBe(14);
    expect(result.current.dirty).toBe(false);
  });

  it('a batch is one undo step, and markSaved makes the state clean', () => {
    const { result } = renderHook(() => useHallEditor({ initial: loadFixture() }));
    act(() => {
      result.current.batch(() => {
        result.current.patch({ hall: { width: 15 } });
        result.current.patch({ hall: { depth: 17 } });
      });
    });
    expect(result.current.config.hall).toMatchObject({ width: 15, depth: 17 });
    act(() => {
      result.current.history.undo();
    });
    expect(result.current.config.hall).toMatchObject({ width: 14, depth: 16 });
    act(() => {
      result.current.patch({ hall: { height: 9 } });
    });
    act(() => {
      result.current.markSaved();
    });
    expect(result.current.dirty).toBe(false);
  });

  it('the policy is enforced by actions and by importText', () => {
    const { result } = renderHook(() =>
      useHallEditor({ initial: loadFixture(), policy: { 'hall.width': 'locked' } }),
    );
    let rejected: Issue[] = [];
    act(() => {
      rejected = result.current.patch({ hall: { width: 20 } });
    });
    expect(rejected[0]?.code).toBe('field.locked');
    const imported = result.current.importText(fixtureText.replace('width: 14.0', 'width: 20.0'));
    expect(imported.ok).toBe(false);
    expect(result.current.config.hall.width).toBe(14);
  });
});

describe('F13: a replacement that changes nothing still starts a new generation', () => {
  it('replace with an equal config drops drafts (a new generation) and adds no undo step', () => {
    const { result } = renderHook(() => useHallEditor({ initial: loadFixture() }));
    const before = result.current.generation;
    act(() => {
      result.current.replace(loadFixture());
    });
    expect(result.current.generation).toBe(before + 1);
    expect(result.current.history.canUndo).toBe(false);
  });

  it('an import identical to the current source starts a new generation', () => {
    const { result } = renderHook(() =>
      useHallEditor({ initial: loadFixture(), source: fixtureText }),
    );
    const before = result.current.generation;
    act(() => {
      result.current.importText(fixtureText);
    });
    expect(result.current.generation).toBe(before + 1);
    expect(result.current.dirty).toBe(false);
  });
});

describe('F23: retained actions enforce the policy committed when they run', () => {
  it('patch and undo kept from an earlier render are refused once the width is locked', () => {
    const { result, rerender } = renderHook(
      ({ policy }: { policy: FieldPolicy }) => useHallEditor({ initial: loadFixture(), policy }),
      { initialProps: { policy: {} } },
    );
    act(() => {
      result.current.patch({ hall: { width: 15 } });
    });
    const { patch, history } = result.current;
    rerender({ policy: { 'hall.width': 'locked' } });
    let patched: Issue[] = [];
    let undone: Issue[] = [];
    act(() => {
      patched = patch({ hall: { width: 20 } });
      undone = history.undo();
    });
    expect(patched[0]?.code).toBe('field.locked');
    expect(undone[0]?.code).toBe('field.locked');
    expect(result.current.config.hall.width).toBe(15);
  });
});
