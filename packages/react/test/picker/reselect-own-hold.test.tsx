import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookResult, Occupancy } from '@cinema-hall/core';
import { SeatPicker } from '../../src/seat-picker/SeatPicker.js';
import { SeatMap } from '../../src/seat-map/SeatMap.js';
import { labels } from '../../src/labels/labels.js';
import type { ConfirmResult } from '../../src/seat-picker/types.js';
import { makeLayout } from './fixtures.js';

vi.mock('../../src/seat-view/SeatView.js', () => ({ SeatView: () => <canvas /> }));

vi.mock('../../src/sheet/GlassSheet.js', () => ({
  GlassSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="mobile-sheet">{children}</div> : null,
}));

const A = 'main.r1.s1';

const B = 'main.r1.s2';

const C = 'main.r1.s3';

const layout = { ...makeLayout(1, 4), pricing: { tiers: { std: 450 } } };

const cell = (name: RegExp) => screen.getByRole('gridcell', { name });

const isSelected = (name: RegExp) => cell(name).getAttribute('aria-selected') === 'true';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as WebGLRenderingContext);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 600,
    height: 800,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 600,
    bottom: 800,
  } as DOMRect);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('seats of the viewer’s own hold can be selected again', () => {
  it('reselects a seat deselected from an active hold; others’ holds and taken seats stay locked', () => {
    const occupancy: Occupancy = {
      revision: 1,
      held: [{ key: A, mine: true }, { key: B, mine: true }, { key: C }],
      taken: ['main.r1.s4'],
    };
    render(
      <SeatPicker
        layout={layout}
        transitions="none"
        selection={{ mode: 'multiple' }}
        occupancy={occupancy}
        defaultValue={[A, B]}
        onBook={async () => ({ ok: true, data: null })}
        onConfirm={async () => ({ ok: true })}
      />,
    );
    expect(isSelected(/A1,/)).toBe(true);
    fireEvent.click(cell(/A1,/));
    expect(isSelected(/A1,/)).toBe(false);
    // Deselected, the own-hold seat is still pickable: not disabled, and a tap selects it again.
    expect(cell(/A1,/).getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(cell(/A1,/));
    expect(isSelected(/A1,/)).toBe(true);
    // Someone else's hold and a sold seat cannot be picked.
    expect(cell(/A3,/).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(cell(/A3,/));
    expect(isSelected(/A3,/)).toBe(false);
    fireEvent.click(cell(/A4,/));
    expect(isSelected(/A4,/)).toBe(false);
  });

  it('a bought seat is not reselectable once deselected', async () => {
    const onBook = vi.fn(async (): Promise<BookResult<null>> => ({
      ok: true,
      data: null,
      hold: { expiresAt: new Date(Date.now() + 600_000).toISOString() },
    }));
    render(
      <SeatPicker
        layout={layout}
        transitions="none"
        selection={{ mode: 'multiple' }}
        occupancy={{ revision: 1 }}
        onBook={onBook}
        onConfirm={async (): Promise<ConfirmResult> => ({ ok: true, ticket: 'T-1' })}
      />,
    );
    fireEvent.click(cell(/A1,/));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }));
    });
    fireEvent.click(cell(/A1,/));
    expect(isSelected(/A1,/)).toBe(false);
    fireEvent.click(cell(/A1,/));
    expect(isSelected(/A1,/)).toBe(false);
  });

  it('SeatMap: isReselectable makes a non-available seat pickable', () => {
    const onActivate = vi.fn();
    const { rerender } = render(
      <SeatMap
        layout={layout}
        status={() => 'held'}
        selected={[]}
        focusKey={null}
        labels={labels.en.picker}
        onFocusSeat={() => {}}
        onActivate={onActivate}
      />,
    );
    fireEvent.click(cell(/A1,/));
    expect(onActivate).not.toHaveBeenCalled();
    rerender(
      <SeatMap
        layout={layout}
        status={() => 'held'}
        selected={[]}
        focusKey={null}
        labels={labels.en.picker}
        onFocusSeat={() => {}}
        onActivate={onActivate}
        isReselectable={(key) => key === A}
      />,
    );
    expect(cell(/A1,/).getAttribute('aria-disabled')).toBeNull();
    expect(cell(/A2,/).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(cell(/A1,/));
    fireEvent.click(cell(/A2,/));
    expect(onActivate.mock.calls).toEqual([[A]]);
  });
});
