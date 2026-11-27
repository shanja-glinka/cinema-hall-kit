import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HallLayout } from '@cinema-hall/core';
import { SeatPicker } from '../../src/seat-picker/SeatPicker.js';
import { balconyDimensions, balconyParts } from '../../src/scene/geometry.js';
import { makeLayout } from './fixtures.js';

vi.mock('../../src/seat-view/SeatView.js', () => ({ SeatView: () => <canvas /> }));
vi.mock('../../src/sheet/GlassSheet.js', () => ({
  GlassSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="mobile-sheet">{children}</div> : null,
}));

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as WebGLRenderingContext);
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

/** A layout built by hand before levels and balconies existed: no `level`, `bands` or sizes. */
function legacyLayout(): HallLayout {
  const layout = makeLayout(2, 3);
  const seats = layout.seats.map(({ level: _level, ...seat }) => seat);
  const rows = layout.rows.map(({ level: _level, ...row }) => row);
  const {
    bands: _bands,
    balconySlabThickness: _slab,
    balconyParapetHeight: _parapet,
    ...rest
  } = layout;
  return { ...rest, seats, rows } as HallLayout;
}

describe('a hand-built single-level layout without the new level fields', () => {
  it('renders one ground-floor map and lets the viewer pick a seat', () => {
    const layout = legacyLayout();
    expect(layout.seats.every((seat) => seat.level === undefined)).toBe(true);
    const { container } = render(
      <SeatPicker layout={layout} transitions="none" occupancy={{ revision: 1 }} />,
    );
    expect(container.querySelectorAll('[data-chk="seat"]').length).toBe(6);
    // A single level: no ground-floor / balcony headings.
    expect(container.querySelectorAll('[data-level]').length).toBeLessThanOrEqual(1);
    fireEvent.click(screen.getByRole('gridcell', { name: /A1,/ }));
    expect(
      container
        .querySelector('[data-chk="seat"][data-key="main.r1.s1"]')!
        .hasAttribute('data-selected'),
    ).toBe(true);
  });

  it('draws no balconies and uses the default balcony sizes', () => {
    const layout = legacyLayout();
    expect(balconyParts(layout)).toEqual([]);
    expect(balconyDimensions(layout)).toEqual({ slabThickness: 0.3, parapetHeight: 0.8 });
  });
});
