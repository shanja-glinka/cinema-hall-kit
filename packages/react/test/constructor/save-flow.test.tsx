import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SaveResult } from '@cinema-hall/core';
import { HallConstructor } from '../../src/constructor/HallConstructor.js';
import { HallConstructorRoot } from '../../src/constructor/HallConstructorRoot.js';
import { useHallEditorContext } from '../../src/constructor/context.js';
import type { SaveController } from '../../src/constructor/save/use-save.js';
import { useHallEditor } from '../../src/constructor/editor/use-hall-editor.js';
import type { HallEditor } from '../../src/constructor/editor/types.js';
import { fixtureText, loadFixture } from './support.js';

vi.mock('../../src/seat-view/HallPreview.js', () => ({ HallPreview: () => null }));
vi.mock('../../src/seat-map/SeatMap.js', () => ({ SeatMap: () => null }));

const CENTRE_SEATS = 'layout.bands[0].sections[1].seatsPerRow';

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

describe('F06: a save answer is scoped to the baseline it started from', () => {
  it('a save answered after a reset leaves the reset baseline and the clean state alone', async () => {
    let resolveSave: (result: SaveResult) => void = () => undefined;
    const onSave = vi.fn(
      () =>
        new Promise<SaveResult>((resolve) => {
          resolveSave = resolve;
        }),
    );
    let handle: HallEditor | undefined;
    function Host() {
      const editor = useHallEditor({ initial: loadFixture(), source: fixtureText });
      handle = editor;
      return <HallConstructor editor={editor} onSave={onSave} />;
    }
    render(<Host />);
    typeAndLeave(field('hall.depth'), '17');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    const reloaded = loadFixture();
    act(() => {
      handle?.reset({ ...reloaded, hall: { ...reloaded.hall, depth: 18 } });
    });
    await act(async () => {
      resolveSave({ ok: true });
    });

    expect(handle?.config.hall.depth).toBe(18);
    expect(handle?.baseline.hall.depth).toBe(18);
    expect(handle?.dirty).toBe(false);
  });
});

describe('F07: a second save call before a render is refused', () => {
  it('the handler runs once when save() is called twice before a render', async () => {
    const onSave = vi.fn(async (): Promise<SaveResult> => ({ ok: true }));
    const sink: { save?: SaveController['save'] } = {};
    function Probe() {
      const controller = useHallEditorContext().save;
      useEffect(() => {
        sink.save = controller.save;
      });
      return null;
    }
    function Host() {
      const editor = useHallEditor({ initial: loadFixture(), source: fixtureText });
      return (
        <HallConstructorRoot editor={editor} onSave={onSave}>
          <Probe />
        </HallConstructorRoot>
      );
    }
    render(<Host />);
    const save = sink.save;
    if (!save) throw new Error('the probe did not capture the save controller');
    await act(async () => {
      await Promise.all([save(), save()]);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe('F08: read-only applies to controls that are already open', () => {
  it('an import dialog opened before read-only is closed and cannot change the hall', () => {
    const { rerender } = render(
      <HallConstructor defaultValue={loadFixture()} source={fixtureText} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: fixtureText.replace('width: 14.0', 'width: 20.0') },
    });
    rerender(<HallConstructor defaultValue={loadFixture()} source={fixtureText} readOnly />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(field('hall.width').value).toBe('14');
  });

  it('a template menu opened before read-only is closed', () => {
    const { rerender } = render(
      <HallConstructor defaultValue={loadFixture()} source={fixtureText} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    expect(screen.getByRole('button', { name: 'Single block' })).toBeDefined();
    rerender(<HallConstructor defaultValue={loadFixture()} source={fixtureText} readOnly />);
    expect(screen.queryByRole('button', { name: 'Single block' })).toBeNull();
  });
});

describe('F10: a current save failure is not hidden by an older notice', () => {
  it('after an import, a failed save shows its error and not the import notice', async () => {
    const onSave = vi.fn(async (): Promise<SaveResult> => {
      throw new Error('network down');
    });
    render(<HallConstructor defaultValue={loadFixture()} source={fixtureText} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: fixtureText } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import' }));
    expect(screen.getByText('Imported')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Save failed: network down');
    expect(screen.queryByText('Imported')).toBeNull();
  });
});

describe('F16: seats removed by the pending edit are still named', () => {
  it('a seat in use that the edit removed is listed in the preview', async () => {
    const onSave = vi.fn(async (): Promise<SaveResult> => ({
      ok: false,
      reason: 'seats_in_use',
      keys: ['centre.r1.s8'],
    }));
    render(<HallConstructor defaultValue={loadFixture()} source={fixtureText} onSave={onSave} />);
    typeAndLeave(field(CENTRE_SEATS), '7');
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    fireEvent.click(save);
    await screen.findByText(/already have bookings/);
    expect(screen.getAllByText(/centre\.r1\.s8/).length).toBeGreaterThan(0);
  });
});

describe('F06: a reset and an edit in one batch are not answered as the saved hall', () => {
  it('a save answered before React commits keeps the reset baseline and the edit', async () => {
    let resolveSave: (result: SaveResult) => void = () => undefined;
    const onSave = vi.fn(
      () =>
        new Promise<SaveResult>((resolve) => {
          resolveSave = resolve;
        }),
    );
    let handle: HallEditor | undefined;
    function Host() {
      const editor = useHallEditor({ initial: loadFixture(), source: fixtureText });
      handle = editor;
      return <HallConstructor editor={editor} onSave={onSave} />;
    }
    render(<Host />);
    typeAndLeave(field('hall.depth'), '17');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    const reloaded = loadFixture();
    await act(async () => {
      handle?.reset({ ...reloaded, hall: { ...reloaded.hall, depth: 18 } });
      handle?.patch({ hall: { width: 18 } });
      resolveSave({ ok: true });
      // The answer is handled here, while the batch above is still uncommitted.
      await Promise.resolve();
    });

    expect(handle?.config.hall.width).toBe(18);
    expect(handle?.baseline.hall.depth).toBe(18);
    expect(handle?.baseline.hall.width).toBe(reloaded.hall.width);
    expect(handle?.dirty).toBe(true);
  });
});
