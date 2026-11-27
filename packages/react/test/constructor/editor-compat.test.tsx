import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import type { Issue, SeatTypeConfig } from '@cinema-hall/core';
import { HallConstructorRoot } from '../../src/constructor/HallConstructorRoot.js';
import { SeatTypesInspector } from '../../src/constructor/inspector/SeatTypesInspector.js';
import { useHallEditor } from '../../src/constructor/editor/use-hall-editor.js';
import type { DeepPatch, HallEditor, SeatTypesApi } from '../../src/constructor/editor/types.js';
import { loadFixture } from './support.js';

afterEach(() => cleanup());

/** `SeatTypesApi` as the last release published it, before `rename`. */
interface PublishedSeatTypesApi {
  add(id: string, def: SeatTypeConfig): Issue[];
  patch(id: string, partial: DeepPatch<SeatTypeConfig>): Issue[];
  remove(id: string): Issue[];
}

describe('a host editor written against the published types', () => {
  it('still type-checks as a HallEditor', () => {
    expectTypeOf<PublishedSeatTypesApi>().toExtend<SeatTypesApi>();
    expectTypeOf<
      Omit<HallEditor, 'seatTypes'> & { readonly seatTypes: PublishedSeatTypesApi }
    >().toExtend<HallEditor>();
  });

  it('edits seat type labels without renaming, and shows the code read-only', () => {
    let seen: HallEditor | undefined;
    function Host() {
      const full = useHallEditor({ initial: loadFixture() });
      const { rename: _rename, ...published } = full.seatTypes;
      const editor: HallEditor = { ...full, seatTypes: published };
      seen = editor;
      return (
        <HallConstructorRoot editor={editor}>
          <SeatTypesInspector />
        </HallConstructorRoot>
      );
    }
    render(<Host />);
    fireEvent.click(within(document.body).getByRole('button', { name: 'Add seat type' }));
    const row = document.querySelector<HTMLElement>('tr[data-seat-type="new-seat-type"]')!;
    expect(row).not.toBeNull();
    // No editable code field: the code is shown as text.
    expect(within(row).queryByLabelText('Short code')).toBeNull();
    expect(row.querySelector('[data-chk="editor-seat-type-code"]')?.textContent).toContain(
      'new-seat-type',
    );
    const label = within(row).getByLabelText('Label');
    fireEvent.change(label, { target: { value: 'Balcony' } });
    fireEvent.blur(label);
    expect(seen?.config.seatTypes['new-seat-type']?.label).toBe('Balcony');
    expect(seen?.config.seatTypes['balcony']).toBeUndefined();
  });
});
