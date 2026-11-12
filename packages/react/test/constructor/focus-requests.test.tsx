import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { HallConstructorInspector } from '../../src/constructor/HallConstructorInspector.js';
import { HallConstructorRoot } from '../../src/constructor/HallConstructorRoot.js';
import { useHallEditorContext, type FocusControl } from '../../src/constructor/context.js';
import { useHallEditor } from '../../src/constructor/editor/use-hall-editor.js';
import { useConstructorSelection } from '../../src/constructor/selection.js';
import { loadFixture } from './support.js';

afterEach(cleanup);
it('selects the stable section reference and focuses the exact field after rendering the inspector', async () => {
  let focus: FocusControl | undefined;
  function Probe() {
    focus = useHallEditorContext().focus;
    return null;
  }
  function Host() {
    const editor = useHallEditor({ initial: loadFixture() });
    return (
      <HallConstructorRoot editor={editor}>
        <Probe />
        <HallConstructorInspector />
      </HallConstructorRoot>
    );
  }
  render(<Host />);
  act(() =>
    focus?.requestFocus(['layout', 'bands', 0, 'sections', 1, 'seatPitch'], {
      sectionId: 'centre',
    }),
  );
  await waitFor(() =>
    expect(document.activeElement?.getAttribute('data-chk-path')).toBe(
      'layout.bands[0].sections[1].seatPitch',
    ),
  );
});

it('shares the public selection hook with a host inspector and clears selection', () => {
  function Controls() {
    const { selection, select, clear } = useConstructorSelection();
    return (
      <>
        <output>{selection?.kind ?? 'empty'}</output>
        <button onClick={() => select({ kind: 'screen' })}>Pick screen</button>
        <button onClick={clear}>Clear</button>
      </>
    );
  }
  function Host() {
    const editor = useHallEditor({ initial: loadFixture() });
    return (
      <HallConstructorRoot editor={editor}>
        <Controls />
        <HallConstructorInspector />
      </HallConstructorRoot>
    );
  }
  render(<Host />);
  fireEvent.click(screen.getByRole('button', { name: 'Pick screen' }));
  expect(screen.getByLabelText('Bottom edge above floor')).toBeDefined();
  expect(screen.getByText('screen')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(screen.queryByLabelText('Bottom edge above floor')).toBeNull();
  expect(screen.getByText('empty')).toBeDefined();
});
