import { readFileSync } from 'node:fs';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { priceForSeat, resolvePricing, type BookContext, type BookResult } from '@cinema-hall/core';
import { SeatPicker } from '../../src/seat-picker/SeatPicker.js';
import { usePickerModel } from '../../src/seat-picker/use-picker-model.js';
import type { SeatPickerRootProps } from '../../src/seat-picker/types.js';
import { withPrice } from '../../src/seat-picker/Footer.js';
import { makeLayout } from './fixtures.js';

const ui = vi.hoisted(() => ({ width: 600 }));
vi.mock('../../src/seat-view/SeatView.js', () => ({ SeatView: () => <canvas /> }));
vi.mock('../../src/sheet/GlassSheet.js', () => ({
  GlassSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="mobile-sheet">{children}</div> : null,
}));

const A = 'main.r1.s1';
const B = 'main.r1.s2';
const layout = { ...makeLayout(1, 3), pricing: { tiers: { std: 450 } } };
const pricing = { tiers: { std: 450 }, seats: { [B]: 650 } };
const base = { layout, pricing, occupancy: { revision: 1 }, transitions: 'none' as const };

beforeEach(() => {
  ui.width = 600;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as WebGLRenderingContext);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const width = this.dataset.chk === 'root' ? ui.width : 600;
    return {
      width,
      height: 800,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: 800,
    } as DOMRect;
  });
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

const ok = async (): Promise<BookResult> => ({ ok: true, data: null });
function pick(name: string) {
  fireEvent.click(screen.getByRole('gridcell', { name: new RegExp(name) }));
}

describe('the quote matches the booked keys (F42)', () => {
  const props = (extra: Partial<SeatPickerRootProps> = {}) => ({
    ...base,
    value: [A],
    view: { stage: 'view' as const, seatKey: B },
    ...extra,
  });
  it.each([
    ['mobile sheet', 600],
    ['desktop panel', 1100],
  ])('%s offers selection, not Book, for a viewed seat the host did not accept', (_name, width) => {
    ui.width = width;
    const onBook = vi.fn(ok);
    const onValueChange = vi.fn();
    render(<SeatPicker {...props({ onBook, onValueChange })} />);
    expect(onValueChange).toHaveBeenCalledWith([B]);
    onValueChange.mockClear();
    expect(screen.queryByRole('button', { name: /Book|Continue/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Select this seat' }));
    expect(onValueChange).toHaveBeenCalledWith([B]);
    expect(onBook).not.toHaveBeenCalled();
  });
  it('books the accepted selection with its own total when the viewed seat is part of it', async () => {
    const onBook = vi.fn(async (_keys: string[], _ctx: BookContext) => ok());
    render(<SeatPicker {...props({ view: { stage: 'view', seatKey: A }, onBook })} />);
    const sheet = screen.getByTestId('mobile-sheet');
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: /Book · 450/ }));
    });
    expect(onBook).toHaveBeenCalledWith(
      [A],
      expect.objectContaining({ prices: [{ key: A, price: 450 }] }),
    );
  });
});

describe('the offered-seat branch follows the displayed seat (F42, round 5)', () => {
  it.each([
    ['mobile sheet', 600],
    ['desktop panel', 1100],
  ])('%s: with my booked A selected, an unselected B still offers selection', (_name, width) => {
    ui.width = width;
    render(
      <SeatPicker
        {...base}
        occupancy={{ revision: 2, held: [{ key: A, mine: true }] }}
        value={[A]}
        onValueChange={vi.fn()}
        view={{ stage: 'view', seatKey: B }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Select this seat' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Seats reserved' })).toBeNull();
  });
  it('shows a disabled Seats reserved for the booked seat itself', () => {
    render(
      <SeatPicker
        {...base}
        occupancy={{ revision: 2, held: [{ key: A, mine: true }] }}
        value={[A]}
        view={{ stage: 'view', seatKey: A }}
      />,
    );
    expect(
      (screen.getByRole('button', { name: 'Seats reserved' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe('a partial total is never quoted (F43)', () => {
  const noB = { tiers: {}, seats: { [A]: 450 } };
  it('shows no price, a hint, and offers no booking on the desktop panel and the mobile footer', async () => {
    const onBook = vi.fn(ok);
    const { container } = render(
      <SeatPicker
        {...base}
        layout={{ ...layout, pricing: undefined }}
        pricing={noB}
        selection={{ mode: 'multiple' }}
        value={[A, B]}
        onBook={onBook}
      />,
    );
    const footer = container.querySelector('[data-chk="footer"]') as HTMLElement;
    const cont = within(footer).getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
    expect(cont.disabled).toBe(true);
    expect(within(footer).getByText('Price not set')).toBeTruthy();
    expect(footer.textContent).not.toMatch(/450/);
    fireEvent.click(cont);
    expect(onBook).not.toHaveBeenCalled();
  });
  it('desktop details: no total, disabled Continue and the hint', () => {
    ui.width = 1100;
    const { container } = render(
      <SeatPicker
        {...base}
        layout={{ ...layout, pricing: undefined }}
        pricing={noB}
        selection={{ mode: 'multiple' }}
        value={[A, B]}
      />,
    );
    pick('A2,');
    const panel = container.querySelector('[data-chk="details-panel"]') as HTMLElement;
    expect(
      (within(panel).getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(within(panel).getByText('Price not set')).toBeTruthy();
    expect(panel.textContent).not.toMatch(/Total|450/);
  });
  it('withPrice drops the dangling separator of an empty price', () => {
    expect(withPrice('Book · ', '')).toBe('Book');
    expect(withPrice('Book · ', '')).toBe('Book');
    expect(withPrice('Book', '450')).toBe('Book · 450');
  });
});

describe('late booking results (F44)', () => {
  function model(props: Partial<SeatPickerRootProps>) {
    return renderHook(
      (input: Partial<SeatPickerRootProps>) => usePickerModel({ ...base, ...input }),
      {
        initialProps: props,
      },
    );
  }
  it.each([
    [5, 10],
    ['0005', '0010'],
  ])(
    'adds no local hold for a success at revision %s that the accepted revision %s already passed',
    async (resultRevision, snapshotRevision) => {
      let resolve!: (result: BookResult) => void;
      const onBook = vi.fn(() => new Promise<BookResult>((done) => (resolve = done)));
      const picker = model({
        defaultValue: [A],
        occupancy: { revision: typeof snapshotRevision === 'number' ? 1 : '0001' },
        onBook,
      });
      act(() => picker.result.current.actions.book());
      picker.rerender({ occupancy: { revision: snapshotRevision, taken: [B] }, onBook });
      await act(async () => resolve({ ok: true, data: null, revision: resultRevision }));
      expect(picker.result.current.effectiveStatus(A)).toBe('available');
      expect(picker.result.current.booked).toBe(false);
      expect(picker.result.current.effectiveStatus(B)).toBe('taken');
    },
  );
  it('still holds a success the accepted snapshot has not reached', async () => {
    let resolve!: (result: BookResult) => void;
    const onBook = vi.fn(() => new Promise<BookResult>((done) => (resolve = done)));
    const picker = model({ defaultValue: [A], onBook });
    act(() => picker.result.current.actions.book());
    await act(async () => resolve({ ok: true, data: null, revision: 5 }));
    expect(picker.result.current.effectiveStatus(A)).toBe('held');
  });
});

describe('desktop details describe the selection or an offered seat (U1)', () => {
  it('never shows "0 seats · Total" for a focused seat, and offers to select it', () => {
    ui.width = 1100;
    const { container } = render(<SeatPicker {...base} selection={{ mode: 'multiple' }} />);
    const panel = () => container.querySelector('[data-chk="details-panel"]') as HTMLElement;
    expect(panel().textContent).not.toMatch(/Total|0 seats/);
    fireEvent.focus(screen.getByRole('gridcell', { name: /A2,/ }));
    expect(within(panel()).getByText('Row A, Seat 2')).toBeTruthy();
    expect(panel().textContent).not.toMatch(/Total|0 seats/);
    const select = within(panel()).getByRole('button', { name: 'Select this seat' });
    expect((select as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(select);
    expect(within(panel()).getByRole('button', { name: /Continue · 650/ })).toBeTruthy();
    expect(panel().querySelector('[data-chk="sheet-selection"]')?.textContent).toMatch(
      /1 seat · Total · 650/,
    );
  });
});

describe('mobile footer layout (U2)', () => {
  it('keeps the seat and price on one line above the two buttons', () => {
    const { container } = render(<SeatPicker {...base} />);
    pick('A1,');
    const footer = container.querySelector('[data-chk="footer"]') as HTMLElement;
    const line = footer.querySelector('[data-chk="footer-line"]') as HTMLElement;
    expect(line.textContent).toMatch(/^Row A · Seat 1\s*·\s*450/);
    const actions = footer.querySelector('[data-chk="footer-actions"]') as HTMLElement;
    expect(line.contains(actions)).toBe(false);
    expect(actions.querySelectorAll('button')).toHaveLength(2);
    expect(line.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('booking prices come from the core resolver (F45)', () => {
  it('sends exactly priceForSeat(resolvePricing(...)) for every booked key, never a raw session value', async () => {
    const onBook = vi.fn(async (_keys: string[], _ctx: BookContext) => ok());
    const session = { tiers: { std: 450.005 }, seats: { [B]: 650.994 } };
    render(
      <SeatPicker
        {...base}
        pricing={session}
        selection={{ mode: 'multiple' }}
        value={[A, B]}
        onBook={onBook}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    });
    const effective = resolvePricing(layout.pricing, session);
    const expected = [A, B].map((key) => ({
      key,
      price: priceForSeat(
        effective,
        layout.seats.find((seat) => seat.key === key)!,
      ),
    }));
    expect(onBook.mock.calls[0]?.[1].prices).toEqual(expected);
  });
});

describe('superseded results leave hold metadata alone (F44, round 5)', () => {
  function model(props: Partial<SeatPickerRootProps>) {
    return renderHook(
      (input: Partial<SeatPickerRootProps>) => usePickerModel({ ...base, ...input }),
      {
        initialProps: props,
      },
    );
  }
  const NEW = '2030-01-01T00:20:00Z';
  const OLD = '2030-01-01T00:05:00Z';
  it.each([
    ['an older expiry', { expiresAt: OLD }],
    ['no hold at all', undefined],
  ])('keeps the newer expiry when a late success carries %s', async (_name, hold) => {
    const results: BookResult[] = [
      { ok: true, data: null, revision: 3, hold: { expiresAt: NEW } },
      { ok: true, data: null, revision: 5, ...(hold ? { hold } : {}) },
    ];
    const onBook = vi.fn(async (): Promise<BookResult> => results.shift()!);
    const selection = { mode: 'multiple' as const };
    const picker = model({ selection, defaultValue: [A], onBook });
    await act(async () => picker.result.current.actions.book());
    // The accepted snapshot confirms A as mine (without an expiry of its own) and moves on.
    picker.rerender({
      selection,
      occupancy: { revision: 10, held: [{ key: A, mine: true }] },
      onBook,
    });
    expect(picker.result.current.holdExpiresAt).toBe(NEW);
    act(() => picker.result.current.actions.select(B));
    await act(async () => picker.result.current.actions.book());
    expect(onBook).toHaveBeenCalledTimes(2);
    expect(picker.result.current.holdExpiresAt).toBe(NEW);
  });
});

describe('footer labels stay on one line (M2)', () => {
  it('drops the price from Continue in a root narrower than 400 px, the summary line keeps it', () => {
    ui.width = 390;
    const { container } = render(<SeatPicker {...base} />);
    pick('A1,');
    const footer = container.querySelector('[data-chk="footer"]') as HTMLElement;
    expect(container.querySelector('[data-chk="root"]')?.hasAttribute('data-chk-narrow')).toBe(
      true,
    );
    const actions = footer.querySelector('[data-chk="footer-actions"]') as HTMLElement;
    const labels = [...actions.querySelectorAll('[data-chk="action-label"]')].map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(['Preview', 'Continue']);
    expect(footer.querySelector('[data-chk="footer-line"]')?.textContent).toMatch(/450/);
  });
  it('keeps the price on Continue in a wider root', () => {
    ui.width = 600;
    const { container } = render(<SeatPicker {...base} />);
    pick('A1,');
    expect(container.querySelector('[data-chk="footer-actions"]')?.textContent).toMatch(
      /Continue · 450/,
    );
  });
  it('styles every action label as nowrap with ellipsis and steps the font down on narrow roots', () => {
    const css = readFileSync('src/seat-picker/seat-picker.css', 'utf8');
    const label = css.slice(css.indexOf("[data-chk='action-label']"));
    const block = label.slice(0, label.indexOf('}'));
    expect(block).toContain('white-space: nowrap');
    expect(block).toContain('text-overflow: ellipsis');
    expect(css).toMatch(/data-chk-narrow\][^{]*footer-actions[^{]*\{[^}]*font-size: 14px/);
  });
});
