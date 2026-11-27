/** The purchase step of the seat picker (`onConfirm`): what is bought, refusals and late answers. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookResult, Occupancy } from '@cinema-hall/core';
import { SeatPicker } from '../../src/seat-picker/SeatPicker.js';
import { normalizeConfirmResult } from '../../src/seat-picker/booking.js';
import { initialPickerState, pickerReducer } from '../../src/seat-picker/store.js';
import type { ConfirmResult } from '../../src/seat-picker/types.js';
import { makeLayout } from './fixtures.js';

vi.mock('../../src/seat-view/SeatView.js', () => ({ SeatView: () => <canvas /> }));

vi.mock('../../src/sheet/GlassSheet.js', () => ({
  GlassSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="mobile-sheet">{children}</div> : null,
}));

const A = 'main.r1.s1';

const C = 'main.r1.s3';

const layout = { ...makeLayout(1, 4), pricing: { tiers: { std: 450 } } };

function setup(onConfirm: (keys: string[]) => Promise<ConfirmResult>) {
  const onBook = vi.fn(async (): Promise<BookResult<{ holdId: string }>> => ({
    ok: true,
    data: { holdId: 'H-1' },
    hold: { expiresAt: new Date(Date.now() + 600_000).toISOString() },
  }));
  const confirm = vi.fn(onConfirm);
  const ui = (occupancy: Occupancy) => (
    <SeatPicker
      layout={layout}
      transitions="none"
      selection={{ mode: 'multiple' }}
      occupancy={occupancy}
      onBook={onBook}
      onConfirm={confirm}
    />
  );
  const view = render(ui({ revision: 1 }));
  return { view, ui, onBook, onConfirm: confirm };
}

async function reserveAndConfirm(seat: RegExp) {
  fireEvent.click(screen.getByRole('gridcell', { name: seat }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }));
  });
}

const cell = (name: RegExp) => screen.getByRole('gridcell', { name });

const B = 'main.r1.s2';

const later = () => new Date(Date.now() + 600_000).toISOString();

const heldBoth = (): Occupancy => ({
  revision: 1,
  held: [
    { key: A, mine: true, expiresAt: later() },
    { key: B, mine: true, expiresAt: later() },
  ],
});

const seatEl = (container: HTMLElement, key: string) =>
  container.querySelector(`[data-chk="seat"][data-key="${key}"]`) as SVGGElement;

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

describe('purchased seats and the next reservation', () => {
  it('books and buys only the new seat after a completed purchase, at its own price', async () => {
    const t = setup(async () => ({ ok: true, ticket: 'T-1' }));
    await reserveAndConfirm(/A1,/);
    expect(t.onConfirm).toHaveBeenLastCalledWith([A], expect.anything());
    // The server now sells A1: it stays in the selection as the viewer's purchase.
    t.view.rerender(t.ui({ revision: 2, taken: [A] }));
    fireEvent.click(screen.getByRole('gridcell', { name: /A3,/ }));
    const continueButton = screen.getByRole('button', { name: /Continue/ });
    expect(continueButton.textContent).toContain('450');
    expect(continueButton.textContent).not.toContain('900');
    await act(async () => {
      fireEvent.click(continueButton);
    });
    expect(t.onBook).toHaveBeenCalledTimes(2);
    const [keys, ctx] = t.onBook.mock.calls[1] as unknown as [
      string[],
      { prices: { key: string }[] },
    ];
    expect(keys).toEqual([C]);
    expect(ctx.prices.map((row) => row.key)).toEqual([C]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }));
    });
    expect(t.onConfirm).toHaveBeenLastCalledWith([C], expect.anything());
  });
});

describe('purchase refusal messages', () => {
  it('shows the explanation the host returned with a refused purchase', async () => {
    setup(async () => ({
      ok: false,
      reason: 'error',
      message: 'Buy both seats, or a single empty seat would be left.',
    }));
    await reserveAndConfirm(/A1,/);
    expect(screen.getByText('Buy both seats, or a single empty seat would be left.')).toBeDefined();
    expect(screen.queryByText(/could not be completed/)).toBeNull();
  });

  it('falls back to the generic text without an explanation', async () => {
    setup(async () => ({ ok: false, reason: 'error' }));
    await reserveAndConfirm(/A1,/);
    expect(screen.getByText(/could not be completed/)).toBeDefined();
  });

  it('keeps the message through the reducer and normalization; blank text is ignored', () => {
    const keys = [A];
    const withText = pickerReducer(initialPickerState(), {
      type: 'confirmResult',
      result: { ok: false, reason: 'error', message: 'Pick both seats.' },
      keys,
    });
    expect(withText.message).toEqual({ kind: 'confirmError', text: 'Pick both seats.' });
    const blank = pickerReducer(initialPickerState(), {
      type: 'confirmResult',
      result: { ok: false, reason: 'error', message: '  ' },
      keys,
    });
    expect(blank.message).toEqual({ kind: 'confirmError' });
    const expired = pickerReducer(initialPickerState(), {
      type: 'confirmResult',
      result: { ok: false, reason: 'expired', message: 'Your reservation ended at 18:05.' },
      keys,
    });
    expect(expired.message).toEqual({
      kind: 'holdExpired',
      text: 'Your reservation ended at 18:05.',
    });
    expect(normalizeConfirmResult({ ok: false, reason: 'expired', message: 'Ended.' })).toEqual({
      ok: false,
      reason: 'expired',
      message: 'Ended.',
    });
  });
});

describe('the purchased total stays what the viewer confirmed', () => {
  it('keeps the confirmed price when the pricing changes after the purchase', async () => {
    const onBook = vi.fn(async (): Promise<BookResult<null>> => ({
      ok: true,
      data: null,
      hold: { expiresAt: new Date(Date.now() + 600_000).toISOString() },
    }));
    const ui = (pricing?: { tiers: Record<string, number> }) => (
      <SeatPicker
        layout={layout}
        pricing={pricing}
        transitions="none"
        selection={{ mode: 'multiple' }}
        occupancy={{ revision: 1 }}
        onBook={onBook}
        onConfirm={async (): Promise<ConfirmResult> => ({ ok: true, ticket: 'T-1' })}
      />
    );
    const view = render(ui());
    fireEvent.click(cell(/A1,/));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }));
    });
    const footerTotal = () =>
      [...document.querySelectorAll('strong')].map((node) => node.textContent ?? '').join('|');
    expect(footerTotal()).toContain('450');
    view.rerender(ui({ tiers: { std: 999 } }));
    expect(footerTotal()).toContain('450');
    expect(footerTotal()).not.toContain('999');
  });
});

describe('the purchase result names the purchase that just completed', () => {
  it('a second purchase does not show the first purchase’s ticket', async () => {
    let next = 0;
    const onBook = vi.fn(async (): Promise<BookResult<null>> => ({
      ok: true,
      data: null,
      hold: { expiresAt: later() },
    }));
    const onConfirm = vi.fn(async (): Promise<ConfirmResult> => ({
      ok: true,
      ticket: `T-${++next}`,
    }));
    render(
      <SeatPicker
        layout={layout}
        transitions="none"
        selection={{ mode: 'multiple' }}
        occupancy={{ revision: 1 }}
        onBook={onBook}
        onConfirm={onConfirm}
      />,
    );
    const buy = async () => {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }));
      });
    };
    fireEvent.click(cell(/A1,/));
    await buy();
    const status = () =>
      [...document.querySelectorAll('[data-chk="purchase"]')].map((n) => n.textContent).join('|');
    expect(status()).toContain('ticket № T-1');
    // The first seat stays selected and sorts first; the second purchase is for A2.
    fireEvent.click(cell(/A2,/));
    await buy();
    expect(onConfirm).toHaveBeenCalledTimes(2);
    expect(status()).toContain('T-2');
    expect(status()).toContain('tickets № T-1, T-2');
  });
});

describe('a refused purchase does not lock another hold', () => {
  it('clears the expiry message when the viewer switches to a different, still active hold', async () => {
    const onConfirm = vi.fn(async (): Promise<ConfirmResult> => ({ ok: false, reason: 'expired' }));
    const occupancy: Occupancy = {
      revision: 1,
      held: [
        { key: A, mine: true, expiresAt: later() },
        { key: B, mine: true, expiresAt: later() },
      ],
    };
    render(
      <SeatPicker
        layout={layout}
        transitions="none"
        selection={{ mode: 'multiple' }}
        occupancy={occupancy}
        defaultValue={[A]}
        onBook={async () => ({ ok: true, data: null })}
        onConfirm={onConfirm}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }));
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText(/reservation has expired/).length).toBeGreaterThan(0);
    // Switch to the other hold: it has not expired, so it can be bought.
    fireEvent.click(cell(/A1,/));
    fireEvent.click(cell(/A2,/));
    expect(screen.queryAllByText(/reservation has expired/)).toHaveLength(0);
    const button = screen.getByRole('button', { name: /Confirm purchase/ });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps the message while the refused seats are still the selection', async () => {
    const occupancy: Occupancy = {
      revision: 1,
      held: [{ key: A, mine: true, expiresAt: later() }],
    };
    render(
      <SeatPicker
        layout={layout}
        transitions="none"
        selection={{ mode: 'multiple' }}
        occupancy={occupancy}
        defaultValue={[A]}
        onBook={async () => ({ ok: true, data: null })}
        onConfirm={async (): Promise<ConfirmResult> => ({ ok: false, reason: 'expired' })}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }));
    });
    expect(screen.getAllByText(/reservation has expired/).length).toBeGreaterThan(0);
  });
});

describe('a late purchase refusal stays with the seats it was about', () => {
  it('reducer: a refusal for seats no longer selected changes neither message nor confirm state', () => {
    let state = pickerReducer(initialPickerState(), { type: 'selectionChanged', keys: [A] });
    state = pickerReducer(state, { type: 'confirmStart' });
    state = pickerReducer(state, { type: 'selectionChanged', keys: [B] });
    const late = pickerReducer(state, {
      type: 'confirmResult',
      result: { ok: false, reason: 'expired' },
      keys: [A],
    });
    expect(late.message).toBeNull();
    expect(late.confirm).toBe('idle');
    // Back on the refused seats, a refusal applies as before.
    const same = pickerReducer(pickerReducer(state, { type: 'selectionChanged', keys: [A] }), {
      type: 'confirmResult',
      result: { ok: false, reason: 'expired' },
      keys: [A],
    });
    expect(same.message).toEqual({ kind: 'holdExpired' });
    expect(same.confirm).toBe('error');
  });

  it('a controlled picker switched to another active hold is not blocked by the late refusal', async () => {
    let settle: (result: ConfirmResult) => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<ConfirmResult>((resolve) => {
          settle = resolve;
        }),
    );
    const occupancy: Occupancy = {
      revision: 1,
      held: [
        { key: A, mine: true, expiresAt: later() },
        { key: B, mine: true, expiresAt: later() },
      ],
    };
    const ui = (value: string[]) => (
      <SeatPicker
        layout={layout}
        transitions="none"
        selection={{ mode: 'multiple' }}
        occupancy={occupancy}
        value={value}
        onValueChange={() => {}}
        onBook={async () => ({ ok: true, data: null })}
        onConfirm={onConfirm}
      />
    );
    const view = render(ui([A]));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }));
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    view.rerender(ui([B]));
    await act(async () => {
      settle({ ok: false, reason: 'expired' });
    });
    expect(screen.queryAllByText(/reservation has expired/)).toHaveLength(0);
    const button = screen.getByRole('button', { name: /Confirm purchase/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});

describe('a purchase refusal is compared with the seats still unpaid', () => {
  it('reducer: after A is bought, a refusal for B alone applies to the selection A+B', () => {
    let state = pickerReducer(initialPickerState(), { type: 'selectionChanged', keys: [A] });
    state = pickerReducer(state, { type: 'confirmStart' });
    // The viewer adds B while A is being bought.
    state = pickerReducer(state, { type: 'selectionChanged', keys: [A, B] });
    state = pickerReducer(state, {
      type: 'confirmResult',
      result: { ok: true, ticket: 'T-1' },
      keys: [A],
    });
    expect(state.selectionKey).toBe(B);
    state = pickerReducer(state, { type: 'confirmStart' });
    const refused = pickerReducer(state, {
      type: 'confirmResult',
      result: { ok: false, reason: 'expired' },
      keys: [B],
    });
    expect(refused.message).toEqual({ kind: 'holdExpired' });
    expect(refused.confirm).toBe('error');
  });

  it('a picker shows the refusal for B after A was bought while B was added', async () => {
    const settles: ((result: ConfirmResult) => void)[] = [];
    const onConfirm = vi.fn(
      (_keys: string[]) =>
        new Promise<ConfirmResult>((resolve) => {
          settles.push(resolve);
        }),
    );
    const occupancy = heldBoth();
    const ui = (value: string[]) => (
      <SeatPicker
        layout={layout}
        transitions="none"
        selection={{ mode: 'multiple' }}
        occupancy={occupancy}
        value={value}
        onValueChange={() => {}}
        onBook={async () => ({ ok: true, data: null })}
        onConfirm={onConfirm}
      />
    );
    const view = render(ui([A]));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }));
    });
    view.rerender(ui([A, B]));
    await act(async () => {
      settles[0]!({ ok: true, ticket: 'T-1' });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }));
    });
    expect(onConfirm).toHaveBeenCalledTimes(2);
    expect(onConfirm.mock.calls[1]![0]).toEqual([B]);
    await act(async () => {
      settles[1]!({ ok: false, reason: 'expired' });
    });
    expect(screen.queryAllByText(/reservation has expired/).length).toBeGreaterThan(0);
    // The expired reservation no longer offers an active purchase button.
    const button = screen.queryByRole('button', {
      name: /Confirm purchase/,
    }) as HTMLButtonElement | null;
    expect(button === null || button.disabled).toBe(true);
  });
});

describe('the purchase hint only shows when the picker offers the purchase', () => {
  const ui = (confirm: boolean) => (
    <SeatPicker
      layout={layout}
      transitions="none"
      selection={{ mode: 'multiple' }}
      occupancy={heldBoth()}
      defaultValue={[A]}
      onBook={async () => ({ ok: true, data: null })}
      {...(confirm ? { onConfirm: async () => ({ ok: true }) as ConfirmResult } : {})}
    />
  );

  it('a reservation-only picker keeps the countdown without the purchase hint', () => {
    render(ui(false));
    expect(document.querySelector('[data-chk="hold-title"]')).not.toBeNull();
    expect(document.querySelector('[data-chk="hold-hint"]')).toBeNull();
    expect(screen.queryAllByText(/Complete the purchase/)).toHaveLength(0);
  });

  it('a picker with onConfirm shows the hint', () => {
    render(ui(true));
    expect(document.querySelector('[data-chk="hold-hint"]')).not.toBeNull();
  });
});

describe('a snapshot that arrives while onConfirm runs', () => {
  const layout = { ...makeLayout(1, 3), pricing: { tiers: { std: 450 } } };
  const reserve = async (): Promise<BookResult<{ holdId: string }>> => ({
    ok: true,
    data: { holdId: 'H-1' },
    hold: { expiresAt: new Date(Date.now() + 600_000).toISOString() },
  });

  function setup() {
    let settle: (result: ConfirmResult) => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<ConfirmResult>((resolve) => {
          settle = resolve;
        }),
    );
    const onSelectionLost = vi.fn();
    const ui = (occupancy: Occupancy) => (
      <SeatPicker
        layout={layout}
        transitions="none"
        occupancy={occupancy}
        onBook={reserve}
        onConfirm={onConfirm}
        onSelectionLost={onSelectionLost}
      />
    );
    const view = render(ui({ revision: 1 }));
    return { view, ui, onConfirm, onSelectionLost, settle: (r: ConfirmResult) => settle(r) };
  }

  async function reserveAndConfirm() {
    fireEvent.click(screen.getByRole('gridcell', { name: /A1,/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }));
    });
  }

  it('keeps the seats being bought selected, and shows the purchase once it succeeds', async () => {
    const t = setup();
    await reserveAndConfirm();
    expect(t.onConfirm).toHaveBeenCalledTimes(1);
    // The server already sold the seats: the next poll shows them as taken.
    t.view.rerender(t.ui({ revision: 3, taken: [A] }));
    expect(t.onSelectionLost).not.toHaveBeenCalled();
    expect(seatEl(t.view.container, A).hasAttribute('data-selected')).toBe(true);
    await act(async () => {
      t.settle({ ok: true, ticket: 'T-7' });
    });
    expect(t.onSelectionLost).not.toHaveBeenCalled();
    expect(seatEl(t.view.container, A).hasAttribute('data-selected')).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Purchased · ticket № T-7');
  });

  it('reconciles the seats with the last snapshot when the purchase fails', async () => {
    const t = setup();
    await reserveAndConfirm();
    t.view.rerender(t.ui({ revision: 3, taken: [A] }));
    expect(t.onSelectionLost).not.toHaveBeenCalled();
    await act(async () => {
      t.settle({ ok: false, reason: 'error' });
    });
    expect(t.onSelectionLost).toHaveBeenCalledWith([A], 'taken');
    expect(seatEl(t.view.container, A).hasAttribute('data-selected')).toBe(false);
  });
});
