import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HallConfig, SaveResult } from '@cinema-hall/core';
import { HallConstructor } from '../../src/constructor/HallConstructor.js';
import type { SaveContext } from '../../src/constructor/types.js';
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

/** Renders the constructor with a hook-made editor, and returns a getter for the newest editor. */
function renderHost(
  onSave: (config: HallConfig, ctx: SaveContext) => Promise<SaveResult>,
  revision: string,
): () => HallEditor {
  const sink: { editor?: HallEditor } = {};
  function Host() {
    const editor = useHallEditor({ initial: loadFixture(), source: fixtureText, revision });
    sink.editor = editor;
    return <HallConstructor editor={editor} onSave={onSave} />;
  }
  render(<Host />);
  return () => {
    if (!sink.editor) throw new Error('the host did not create an editor');
    return sink.editor;
  };
}

describe('F27: the revision token travels with the hall', () => {
  it('each save sends the token that the last save adopted', async () => {
    const seen: (string | number | undefined)[] = [];
    const onSave = vi.fn(async (_config: HallConfig, ctx: SaveContext): Promise<SaveResult> => {
      seen.push(ctx.revision);
      return { ok: true, revision: `r${seen.length + 1}` };
    });
    const current = renderHost(onSave, 'r1');
    expect(current().revision).toBe('r1');

    typeAndLeave(field('hall.depth'), '17');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(current().revision).toBe('r2'));

    typeAndLeave(field('hall.depth'), '18');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(seen).toEqual(['r1', 'r2']);
  });

  it('after a conflict, loading the server version adopts its token and keeps its YAML comments', async () => {
    const serverConfig: HallConfig = {
      ...loadFixture(),
      hall: { ...loadFixture().hall, depth: 18 },
    };
    const serverYaml = `# Server version 7\n${fixtureText}`;
    const seen: (string | number | undefined)[] = [];
    const onSave = vi.fn(async (_config: HallConfig, ctx: SaveContext): Promise<SaveResult> => {
      seen.push(ctx.revision);
      if (seen.length === 1) {
        return {
          ok: false,
          reason: 'conflict',
          server: serverConfig,
          source: serverYaml,
          revision: 's7',
        };
      }
      return { ok: true };
    });
    const current = renderHost(onSave, 'r1');

    typeAndLeave(field('hall.depth'), '17');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load server version' }));

    expect(current().config.hall.depth).toBe(18);
    expect(current().dirty).toBe(false);
    expect(current().revision).toBe('s7');
    expect(current().exportYaml()).toContain('# Server version 7');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(seen).toEqual(['r1', 's7']);
  });

  it('a reset without a token keeps the current one', () => {
    const current = renderHost(async (): Promise<SaveResult> => ({ ok: true }), 'r1');
    act(() => {
      current().reset(loadFixture());
    });
    expect(current().revision).toBe('r1');
  });
});
