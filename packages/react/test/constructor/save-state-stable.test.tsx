import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HallConfig, SaveResult } from '@cinema-hall/core';
import { HallConstructor } from '../../src/constructor/HallConstructor.js';
import { useHallEditor } from '../../src/constructor/editor/use-hall-editor.js';
import type { HallEditor } from '../../src/constructor/editor/types.js';
import type { SaveHandler } from '../../src/constructor/types.js';
import { fixtureText, loadFixture } from './support.js';

vi.mock('../../src/seat-view/HallPreview.js', () => ({ HallPreview: () => null }));
vi.mock('../../src/seat-map/SeatMap.js', () => ({ SeatMap: () => null }));
afterEach(() => cleanup());

const toolbar = (): HTMLElement =>
  document.querySelector<HTMLElement>('[data-chk="editor-toolbar"]')!;
const saveState = (): Element => document.querySelector('[data-chk="editor-save-state"]')!;
const notes = (): Element[] => [...document.querySelectorAll('[data-chk="editor-applied"]')];

function commit(element: HTMLElement, value: string): void {
  fireEvent.change(element, { target: { value } });
  fireEvent.blur(element);
}

/** Opens "Seats and prices" and changes the recliner price. */
function changeReclinerPrice(value: string): void {
  fireEvent.click(within(toolbar()).getByRole('button', { name: 'Seats and prices' }));
  const row = document.querySelector<HTMLElement>('tr[data-seat-type="recliner"]')!;
  commit(within(row).getByLabelText('Seat price'), value);
}

let handle: HallEditor | undefined;
function Host({ onSave }: { onSave?: SaveHandler }) {
  const editor = useHallEditor({ initial: loadFixture(), source: fixtureText, revision: 'r1' });
  handle = editor;
  return <HallConstructor editor={editor} onSave={onSave} />;
}

describe('"Changed — not saved yet" goes away once the change is saved', () => {
  it('a successful save clears the field note and the toolbar says everything is saved', async () => {
    render(<Host onSave={async (): Promise<SaveResult> => ({ ok: true, revision: 'r2' })} />);
    changeReclinerPrice('700');
    expect(notes().length).toBe(1);
    expect(saveState().textContent).toBe('Unsaved changes');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(handle?.dirty).toBe(false);
    expect(notes()).toEqual([]);
    expect(document.querySelector('[data-chk="editor-field"][data-applied]')).toBeNull();
    expect(saveState().textContent).toBe('All changes saved');
    expect(saveState().getAttribute('data-state')).toBe('saved');
  });

  it('a host that then installs the server text of the saved hall keeps the saved state', async () => {
    // The demo does this after creating a hall: the editor takes the server's text and its token.
    const onSave: SaveHandler = async (config: HallConfig) => {
      setTimeout(() => handle?.reset({ ...config, id: 'new-hall' }, { revision: 'r2' }), 0);
      return { ok: true, revision: 'r2' };
    };
    render(<Host onSave={onSave} />);
    changeReclinerPrice('650');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => expect(handle?.config.id).toBe('new-hall'));
    expect(notes()).toEqual([]);
    expect(saveState().textContent).toBe('All changes saved');
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDefined();
    // The next edit makes it unsaved again.
    const row = document.querySelector<HTMLElement>('tr[data-seat-type="recliner"]')!;
    commit(within(row).getByLabelText('Seat price'), '600');
    expect(saveState().textContent).toBe('Unsaved changes');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined();
    expect(notes().length).toBe(1);
  });

  it('"Save as new hall" (a host reset outside the save) clears the field notes', () => {
    render(<Host onSave={async (): Promise<SaveResult> => ({ ok: true })} />);
    changeReclinerPrice('700');
    expect(notes().length).toBe(1);
    act(() => {
      const saved = handle!.config;
      handle?.reset({ ...saved, id: 'copy' }, { revision: 1 });
    });
    expect(notes()).toEqual([]);
    expect(saveState().textContent).toBe('');
  });

  it('loading the server version after a conflict clears the field notes', async () => {
    const server: HallConfig = { ...loadFixture(), hall: { ...loadFixture().hall, depth: 18 } };
    render(
      <Host
        onSave={async (): Promise<SaveResult> => ({
          ok: false,
          reason: 'conflict',
          server,
          revision: 's7',
        })}
      />,
    );
    changeReclinerPrice('700');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load server version' }));
    expect(handle?.dirty).toBe(false);
    expect(notes()).toEqual([]);
  });

  it('undoing back to the saved state clears the note too', () => {
    render(<Host />);
    changeReclinerPrice('700');
    expect(notes().length).toBe(1);
    act(() => {
      handle?.history.undo();
    });
    expect(handle?.dirty).toBe(false);
    expect(notes()).toEqual([]);
  });
});

/** Every element of the toolbar rows, by tag and part: what the layout is made of, without text. */
function toolbarShape(): string[] {
  return [
    ...toolbar().querySelectorAll(
      '[data-chk="editor-toolbar-main"] *, [data-chk="editor-toolbar-tools"] *',
    ),
  ].map((node) => `${node.tagName}:${node.getAttribute('data-chk') ?? ''}`);
}

describe('the toolbar buttons keep their place when the hall becomes unsaved or saved', () => {
  it('renaming the hall adds nothing to the toolbar: same elements before, while dirty and after save', async () => {
    render(<Host onSave={async (): Promise<SaveResult> => ({ ok: true })} />);
    const clean = toolbarShape();
    const name = toolbar().querySelector<HTMLInputElement>('[data-chk-path="name"]')!;
    fireEvent.focus(name);
    commit(name, 'New hall');
    expect(handle?.config.name).toBe('New hall');
    // No "not saved yet" note above the name field: it would push the buttons down.
    expect(toolbar().querySelector('[data-chk="editor-applied"]')).toBeNull();
    expect(saveState().textContent).toBe('Unsaved changes');
    expect(toolbarShape()).toEqual(clean);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(saveState().textContent).toBe('All changes saved');
    expect(toolbarShape()).toEqual(clean);
  });

  it('the state and the Save label carry every text they can show, to keep one width', () => {
    render(<Host onSave={async (): Promise<SaveResult> => ({ ok: true })} />);
    const text = saveState().querySelector('[data-chk="editor-save-state-text"]')!;
    expect(text.getAttribute('data-size-unsaved')).toBe('Unsaved changes');
    expect(text.getAttribute('data-size-saved')).toBe('All changes saved');
    const label = toolbar().querySelector('[data-chk="editor-save-label"]')!;
    expect(label.getAttribute('data-size-a')).toBe('Save');
    expect(label.getAttribute('data-size-b')).toBe('Saved');
    expect(
      label.querySelector('[data-chk="editor-save-label-text"]')?.getAttribute('data-size-c'),
    ).toBe('Saving…');
    // The dot of the Save button is always there; only its visibility follows the dirty state.
    const dot = toolbar().querySelector('[data-chk="editor-dirty"]')!;
    expect(dot.hasAttribute('data-on')).toBe(false);
    act(() => {
      handle?.patch({ name: 'Other' });
    });
    expect(toolbar().querySelector('[data-chk="editor-dirty"]')).toBe(dot);
    expect(dot.hasAttribute('data-on')).toBe(true);
  });

  it('the stylesheet reserves the space instead of removing an empty state', () => {
    const css = readFileSync('src/constructor/constructor.css', 'utf8');
    expect(css).not.toContain("[data-chk='editor-save-state']:empty");
    expect(css).toMatch(/\[data-chk='editor-dirty'\]\) \{[^}]*visibility: hidden/);
    expect(css).toMatch(/\[data-chk='editor-save-state'\]\)::before \{[^}]*visibility: hidden/);
    expect(css).toContain('content: attr(data-size-unsaved)');
  });
});
