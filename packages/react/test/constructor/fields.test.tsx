import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HallConfig, SaveResult } from '@cinema-hall/core';
import { HallConstructor } from '../../src/constructor/HallConstructor.js';
import { useHallEditor } from '../../src/constructor/editor/use-hall-editor.js';
import type { HallEditor } from '../../src/constructor/editor/types.js';
import { fixtureText, loadFixture } from './support.js';

vi.mock('../../src/seat-view/HallPreview.js', () => ({ HallPreview: () => null }));
vi.mock('../../src/seat-map/SeatMap.js', () => ({ SeatMap: () => null }));

function field(path: string): HTMLInputElement {
  if (!document.querySelector(`[data-chk-path="${path}"]`)) {
    const selector = path.startsWith('hall.')
      ? '[data-chk="editor-hall-object"]'
      : path.startsWith('screen.')
        ? '[data-chk="editor-screen-object"]'
        : '[data-chk="editor-section-object"][data-section="centre"]';
    const object = document.querySelector(selector);
    if (object) fireEvent.click(object);
  }
  const element = document.querySelector<HTMLInputElement>(`[data-chk-path="${path}"]`);
  if (!element) throw new Error(`no field with path ${path}`);
  return element;
}

function typeAndLeave(element: HTMLInputElement, value: string): void {
  fireEvent.change(element, { target: { value } });
  fireEvent.blur(element);
}

afterEach(() => {
  cleanup();
});

describe('F11: a field reflects the server answer and every matching severity', () => {
  it('a server error on hall.width marks the field invalid and points the message at it', async () => {
    const onSave = vi.fn(async (): Promise<SaveResult> => ({
      ok: false,
      reason: 'invalid',
      issues: [{ severity: 'error', code: 'fit.width', path: ['hall', 'width'] }],
    }));
    render(<HallConstructor defaultValue={loadFixture()} source={fixtureText} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/server rejected/);
    const width = field('hall.width');
    expect(width.getAttribute('aria-invalid')).toBe('true');
    expect(width.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('a warning followed by an error on the same path still marks the field invalid', async () => {
    const onSave = vi.fn(async (): Promise<SaveResult> => ({
      ok: false,
      reason: 'invalid',
      issues: [
        { severity: 'warning', code: 'fit.width', path: ['hall', 'width'] },
        { severity: 'error', code: 'fit.width', path: ['hall', 'width'] },
      ],
    }));
    render(<HallConstructor defaultValue={loadFixture()} source={fixtureText} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/server rejected/);
    expect(field('hall.width').getAttribute('aria-invalid')).toBe('true');
  });
});

describe('F12: arrow keys step from the valid draft', () => {
  it('a typed value that is not committed yet is the base of the step', () => {
    render(<HallConstructor defaultValue={loadFixture()} source={fixtureText} />);
    const width = field('hall.width');
    fireEvent.change(width, { target: { value: '20' } });
    fireEvent.keyDown(width, { key: 'ArrowUp' });
    expect(width.value).toBe('20.05');
  });
});

describe('F13: a reset or replacement drops the unfinished draft', () => {
  it('after a reset the field shows the new value, not the draft it had', () => {
    let handle: HallEditor | undefined;
    function Host() {
      const editor = useHallEditor({ initial: loadFixture(), source: fixtureText });
      handle = editor;
      return <HallConstructor editor={editor} />;
    }
    render(<Host />);
    const width = field('hall.width');
    fireEvent.change(width, { target: { value: 'unfinished' } });
    const loaded: HallConfig = loadFixture();
    act(() => {
      handle?.reset({ ...loaded, hall: { ...loaded.hall, width: 20 } });
    });
    expect(handle?.config.hall.width).toBe(20);
    expect(field('hall.width').value).toBe('20');
  });

  it('a draft that was rejected is also dropped by a reset', async () => {
    let handle: HallEditor | undefined;
    function Host() {
      const editor = useHallEditor({ initial: loadFixture(), source: fixtureText });
      handle = editor;
      return <HallConstructor editor={editor} />;
    }
    render(<Host />);
    typeAndLeave(field('hall.depth'), 'abc');
    expect(screen.getByText('Enter a number')).toBeDefined();
    const loaded: HallConfig = loadFixture();
    act(() => {
      handle?.reset({ ...loaded, hall: { ...loaded.hall, depth: 21 } });
    });
    await waitFor(() => expect(field('hall.depth').value).toBe('21'));
    expect(screen.queryByText('Enter a number')).toBeNull();
  });
});

describe('F13: a replacement equal to the current config drops an unfinished draft', () => {
  it('the width field shows the hall value again after replace', () => {
    let handle: HallEditor | undefined;
    function Host() {
      const editor = useHallEditor({ initial: loadFixture() });
      handle = editor;
      return <HallConstructor editor={editor} />;
    }
    render(<Host />);
    fireEvent.change(field('hall.width'), { target: { value: 'unfinished' } });
    expect(field('hall.width').value).toBe('unfinished');
    act(() => {
      handle?.replace(loadFixture());
    });
    expect(field('hall.width').value).toBe('14');
  });
});
