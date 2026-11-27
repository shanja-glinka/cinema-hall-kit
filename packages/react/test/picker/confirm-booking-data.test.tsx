/** The `booking` data that `onConfirm` receives: it belongs to one active reservation made by the picker. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookResult, Occupancy } from '@cinema-hall/core';
import { SeatPicker } from '../../src/seat-picker/SeatPicker.js';
import type { ConfirmContext, ConfirmResult } from '../../src/seat-picker/types.js';
import { makeLayout } from './fixtures.js';

vi.mock('../../src/seat-view/SeatView.js', () => ({ SeatView: () => <canvas /> }));

vi.mock('../../src/sheet/GlassSheet.js', () => ({
  GlassSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="mobile-sheet">{children}</div> : null,
}));

const A = 'main.r1.s1';

const layout = { ...makeLayout(1, 4), pricing: { tiers: { std: 450 } } };

const inMs = (ms: number) => new Date(Date.now() + ms).toISOString();

function setup(holdMs: number) {
  const onBook = vi.fn(async (): Promise<BookResult<{ holdId: string }>> => ({
    ok: true,
    data: { holdId: 'H-1' },
    revision: 2,
    hold: { expiresAt: inMs(holdMs) },
  }));
  const onConfirm = vi.fn(
    async (_keys: string[], _ctx: ConfirmContext<{ holdId: string }>): Promise<ConfirmResult> => ({
      ok: true,
      ticket: 'T-1',
    }),
  );
  const ui = (occupancy: Occupancy) => (
    <SeatPicker
      layout={layout}
      transitions="none"
      selection={{ mode: 'multiple' }}
      occupancy={occupancy}
      onBook={onBook}
      onConfirm={onConfirm}
    />
  );
  const view = render(ui({ revision: 1 }));
  return { view, ui, onConfirm };
}

async function reserve() {
  fireEvent.click(screen.getByRole('gridcell', { name: /A1,/ }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
  });
}

async function confirm() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }));
  });
}

const mineAt = (revision: number, expiresAt: string): Occupancy => ({
  revision,
  held: [{ key: A, mine: true, expiresAt }],
});

const B = 'main.r1.s2';

const expiresAt = new Date(Date.now() + 600_000).toISOString();

function setupSeparateHolds() {
  let hold = 0;
  const onBook = vi.fn(async (): Promise<BookResult<{ holdId: string }>> => ({
    ok: true,
    data: { holdId: `H-${++hold}` },
    revision: 1 + hold,
    hold: { expiresAt },
  }));
  const onConfirm = vi.fn(
    async (_keys: string[], _ctx: ConfirmContext<{ holdId: string }>): Promise<ConfirmResult> => ({
      ok: true,
      ticket: 'T-1',
    }),
  );
  const ui = (occupancy: Occupancy) => (
    <SeatPicker
      layout={layout}
      transitions="none"
      selection={{ mode: 'multiple' }}
      occupancy={occupancy}
      onBook={onBook}
      onConfirm={onConfirm}
    />
  );
  const view = render(ui({ revision: 1 }));
  return { view, ui, onBook, onConfirm };
}

const seat = (name: RegExp) => screen.getByRole('gridcell', { name });

async function book() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
  });
}

const mine = (revision: number, keys: string[]): Occupancy => ({
  revision,
  held: keys.map((key) => ({ key, mine: true, expiresAt })),
});

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
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('booking data belongs to the hold that supplied it', () => {
  it('passes the booking data while the reservation made here is still active', async () => {
    const t = setup(600_000);
    await reserve();
    const expiry = inMs(600_000);
    t.view.rerender(t.ui(mineAt(2, expiry)));
    await confirm();
    expect(t.onConfirm).toHaveBeenCalledTimes(1);
    expect(t.onConfirm.mock.calls[0]![1].booking).toEqual({ holdId: 'H-1' });
  });

  it('keeps the booking data when the server extends the active reservation', async () => {
    const t = setup(600_000);
    await reserve();
    t.view.rerender(t.ui(mineAt(2, inMs(900_000))));
    await confirm();
    expect(t.onConfirm.mock.calls[0]![1].booking).toEqual({ holdId: 'H-1' });
  });

  it('drops the data once the seat stops being held, even if a new own hold arrives later', async () => {
    const t = setup(600_000);
    await reserve();
    t.view.rerender(t.ui(mineAt(2, inMs(600_000))));
    // The hold ends (released on the server), then the viewer reserves again in another tab.
    t.view.rerender(t.ui({ revision: 3 }));
    t.view.rerender(t.ui(mineAt(4, inMs(600_000))));
    await confirm();
    expect(t.onConfirm).toHaveBeenCalledTimes(1);
    expect(t.onConfirm.mock.calls[0]![1].booking).toBeUndefined();
  });

  it('drops the data of an expired hold when a new own hold replaces it without a gap', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const t = setup(60_000);
    await reserve();
    // The first reservation runs out; the next snapshot already shows the hold made elsewhere.
    vi.setSystemTime(Date.now() + 120_000);
    t.view.rerender(t.ui(mineAt(3, inMs(600_000))));
    await confirm();
    expect(t.onConfirm).toHaveBeenCalledTimes(1);
    expect(t.onConfirm.mock.calls[0]![1].booking).toBeUndefined();
  });
});

// The browser clock runs ahead of the server's by more than the hold has left. The
// countdown (server time) shows the hold as active, and the booking data must stay with it too.
describe('booking data expires on the server clock', () => {
  it('passes the booking data when the browser clock is ahead of the server', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const ahead = 120_000;
    const serverAt = (ms: number) => new Date(Date.now() - ahead + ms).toISOString();
    const expiresAt = serverAt(60_000);
    const onBook = vi.fn(async (): Promise<BookResult<{ holdId: string }>> => ({
      ok: true,
      data: { holdId: 'H-1' },
      revision: 2,
      hold: { expiresAt },
    }));
    const onConfirm = vi.fn(
      async (
        _keys: string[],
        _ctx: ConfirmContext<{ holdId: string }>,
      ): Promise<ConfirmResult> => ({
        ok: true,
        ticket: 'T-1',
      }),
    );
    const ui = (occupancy: Occupancy) => (
      <SeatPicker
        layout={layout}
        transitions="none"
        selection={{ mode: 'multiple' }}
        occupancy={occupancy}
        onBook={onBook}
        onConfirm={onConfirm}
      />
    );
    const view = render(ui({ revision: 1, serverNow: serverAt(0) }));
    fireEvent.click(screen.getByRole('gridcell', { name: /A1,/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    });
    view.rerender(
      ui({ revision: 2, serverNow: serverAt(0), held: [{ key: A, mine: true, expiresAt }] }),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }));
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]![1].booking).toEqual({ holdId: 'H-1' });
  });
});

describe('booking data covers every confirmed seat or none', () => {
  it('passes no booking data when the confirmed seats come from two separate holds', async () => {
    const t = setupSeparateHolds();
    fireEvent.click(seat(/A1,/));
    await book();
    t.view.rerender(t.ui(mine(2, [A])));
    // The viewer swaps to another seat and reserves it separately, then selects both again.
    fireEvent.click(seat(/A1,/));
    fireEvent.click(seat(/A2,/));
    await book();
    t.view.rerender(t.ui(mine(3, [A, B])));
    fireEvent.click(seat(/A1,/));
    expect(t.onBook).toHaveBeenCalledTimes(2);
    await confirm();
    expect(t.onConfirm).toHaveBeenCalledTimes(1);
    expect([...t.onConfirm.mock.calls[0]![0]].sort()).toEqual([A, B]);
    expect(t.onConfirm.mock.calls[0]![1].booking).toBeUndefined();
  });

  it('passes no booking data when one confirmed seat was held outside this picker', async () => {
    const t = setupSeparateHolds();
    fireEvent.click(seat(/A1,/));
    await book();
    // B is the viewer's own hold from another tab: this picker has no data for it.
    t.view.rerender(t.ui(mine(2, [A, B])));
    fireEvent.click(seat(/A2,/));
    await confirm();
    expect([...t.onConfirm.mock.calls[0]![0]].sort()).toEqual([A, B]);
    expect(t.onConfirm.mock.calls[0]![1].booking).toBeUndefined();
  });

  it('passes the booking data when one hold covers every confirmed seat', async () => {
    const t = setupSeparateHolds();
    fireEvent.click(seat(/A1,/));
    fireEvent.click(seat(/A2,/));
    await book();
    t.view.rerender(t.ui(mine(2, [A, B])));
    await confirm();
    expect([...t.onConfirm.mock.calls[0]![0]].sort()).toEqual([A, B]);
    expect(t.onConfirm.mock.calls[0]![1].booking).toEqual({ holdId: 'H-1' });
  });
});
