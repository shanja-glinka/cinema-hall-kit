import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookContext, BookResult, Occupancy } from '@cinema-hall/core';
import { usePickerModel } from '../../src/seat-picker/use-picker-model.js';
import type { SeatPickerRootProps } from '../../src/seat-picker/types.js';
import { holdTime } from '../../src/seat-picker/Footer.js';
import { makeLayout } from './fixtures.js';

const A = 'main.r1.s1';
const B = 'main.r1.s2';
const C = 'main.r1.s3';
const layout = makeLayout(1, 3);
const pricing = { tiers: { std: 1250 } };
const expiry = '2030-01-01T00:10:00Z';
const defaults: SeatPickerRootProps = {
  layout,
  pricing,
  occupancy: { revision: 1 },
  transitions: 'none',
};

function model(props: Partial<SeatPickerRootProps> = {}) {
  return renderHook(
    (input: Partial<SeatPickerRootProps>) => usePickerModel({ ...defaults, ...input }),
    { initialProps: props },
  );
}
async function book(picker: ReturnType<typeof model>) {
  await act(async () => {
    picker.result.current.actions.book();
  });
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('accepted occupancy and effective booking (F02, F04, A5)', () => {
  it('retains the high-water snapshot through a loading gap and rejects stale availability', async () => {
    const onBook = vi.fn(async (): Promise<BookResult> => ({ ok: true, data: null }));
    const picker = model({ value: [A], occupancy: { revision: 10, taken: [A] }, onBook });
    picker.rerender({ value: [A], occupancy: undefined, onBook });
    expect(picker.result.current.inert).toBe(true);
    await book(picker);
    picker.rerender({ value: [A], occupancy: { revision: 9 }, onBook });
    expect(picker.result.current.occupancy?.revision).toBe(10);
    expect(picker.result.current.effectiveStatus(A)).toBe('taken');
    await book(picker);
    expect(onBook).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown', ['unknown'], { revision: 1 }],
    ['unavailable', [A], { revision: 1, taken: [A] }],
    ['held', [A], { revision: 1, held: [{ key: A }] }],
    ['blocked', [A], { revision: 1, blocked: [A] }],
  ] as const)('does not book %s controlled keys', async (_name, keys, occupancy) => {
    const onBook = vi.fn();
    const picker = model({ value: [...keys], occupancy: occupancy as Occupancy, onBook });
    await book(picker);
    expect(onBook).not.toHaveBeenCalled();
    expect(picker.result.current.state.violations.length).toBeGreaterThan(0);
  });

  it('does not book while loading', async () => {
    const onBook = vi.fn();
    const picker = model({ value: [A], occupancy: undefined, onBook });
    await book(picker);
    expect(onBook).not.toHaveBeenCalled();
  });

  it('validates conflict marks even when a controlled host retains the conflicted key', async () => {
    const onBook = vi.fn(async (): Promise<BookResult> => ({
      ok: false,
      reason: 'conflict',
      keys: [A],
    }));
    const picker = model({ value: [A], onBook });
    await book(picker);
    expect(picker.result.current.effectiveStatus(A)).toBe('taken');
    await book(picker);
    expect(onBook).toHaveBeenCalledTimes(1);
    expect(picker.result.current.state.violations).toContainEqual({
      code: 'unavailable',
      keys: [A],
      params: { status: 'taken' },
    });
  });
});

describe('accepted selection and attempts (F06, F41, A4)', () => {
  it('keeps the attempt after a refused controlled request', async () => {
    const onBook = vi.fn(async (_keys: string[], _ctx: BookContext): Promise<BookResult> => ({
      ok: false,
      reason: 'error',
    }));
    const onValueChange = vi.fn();
    const picker = model({ value: [A], onBook, onValueChange });
    await book(picker);
    act(() => picker.result.current.actions.select(B));
    expect(onValueChange).toHaveBeenCalledWith([B]);
    expect(picker.result.current.selected).toEqual([A]);
    await book(picker);
    expect(onBook.mock.calls[1]?.[1].attemptId).toEqual(onBook.mock.calls[0]?.[1].attemptId);
  });

  it('starts a new attempt after external controlled A to B to A', async () => {
    const calls: BookContext[] = [];
    const onBook = vi.fn(async (_keys: string[], ctx: BookContext): Promise<BookResult> => {
      calls.push(ctx);
      return { ok: false, reason: 'error' };
    });
    const picker = model({ value: [A], onBook });
    await book(picker);
    picker.rerender({ value: [B], onBook });
    picker.rerender({ value: [A], onBook });
    await book(picker);
    expect(calls[1]?.attemptId).not.toBe(calls[0]?.attemptId);
  });

  it('canonicalizes duplicate controlled values for totals, rules, requests and booking', async () => {
    const seen: string[][] = [];
    const rule = vi.fn(() => null);
    const onBook = vi.fn(async (keys: string[], ctx: BookContext): Promise<BookResult> => {
      seen.push(keys);
      expect(ctx.prices.map((row) => row.key)).toEqual([A, B]);
      return { ok: false, reason: 'error' };
    });
    const onValueChange = vi.fn();
    const picker = model({
      value: [B, A, A],
      selection: { mode: 'multiple', rules: [rule] },
      onBook,
      onValueChange,
    });
    expect(picker.result.current.selected).toEqual([A, B]);
    expect(picker.result.current.total).toBe(2500);
    await book(picker);
    expect(seen).toEqual([[A, B]]);
    expect(rule).toHaveBeenCalledWith(expect.objectContaining({ keys: [A, B] }));
    act(() => picker.result.current.actions.select(C));
    expect(onValueChange).toHaveBeenCalledWith([A, B, C]);
  });
});

describe('independent pending ownership and expiry (F07, F37)', () => {
  it('retains each booking until its own confirming revision', async () => {
    const onBook = vi.fn(async (keys: string[]): Promise<BookResult> => ({
      ok: true,
      data: null,
      revision: keys[0] === A ? 5 : 6,
    }));
    const picker = model({ defaultValue: [A], onBook });
    await book(picker);
    act(() => picker.result.current.actions.select(B));
    await book(picker);
    expect(picker.result.current.effectiveStatus(A)).toBe('held');
    expect(picker.result.current.effectiveStatus(B)).toBe('held');
    picker.rerender({ occupancy: { revision: 5 }, onBook });
    expect(picker.result.current.effectiveStatus(A)).toBe('available');
    expect(picker.result.current.effectiveStatus(B)).toBe('held');
    picker.rerender({ occupancy: { revision: 6 }, onBook });
    expect(picker.result.current.effectiveStatus(B)).toBe('available');
  });

  it.each([undefined, '2030-01-01T00:12:00Z'])(
    'associates confirmed expiry with the booked hold (%s)',
    async (confirmedExpiry) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
      const onBook = vi.fn(async (): Promise<BookResult> => ({
        ok: true,
        data: null,
        revision: 2,
        hold: { expiresAt: expiry },
      }));
      const picker = model({ defaultValue: [A], onBook });
      await book(picker);
      picker.rerender({
        onBook,
        occupancy: {
          revision: 2,
          serverNow: '2030-01-01T00:00:30Z',
          held: [
            { key: B, mine: true, expiresAt: '2030-01-01T00:03:00Z' },
            { key: A, mine: true, ...(confirmedExpiry ? { expiresAt: confirmedExpiry } : {}) },
          ],
        },
      });
      expect(picker.result.current.holdExpiresAt).toBe(confirmedExpiry ?? expiry);
      expect(picker.result.current.holdSkewMs).toBe(30_000);
      expect(
        holdTime(
          picker.result.current.holdExpiresAt!,
          Date.now(),
          picker.result.current.holdSkewMs,
        ),
      ).toBe(confirmedExpiry ? '11:30' : '09:30');
      act(() => vi.advanceTimersByTime(1000));
      expect(picker.result.current.holdNowMs).toBe(Date.now());
    },
  );
});

describe('view intents and deferred deep links (F14, A1, A2, A3)', () => {
  it('requests controlled Continue and Back but waits for the host; external changes emit no request', () => {
    const onViewChange = vi.fn();
    const props: Partial<SeatPickerRootProps> = {
      value: [A],
      view: { stage: 'map' },
      onViewChange,
    };
    const picker = model(props);
    act(() => picker.result.current.actions.continueToView());
    expect(onViewChange).toHaveBeenCalledWith({ stage: 'view', seatKey: A });
    expect(picker.result.current.target).toBe('map');
    picker.rerender({ ...props, view: { stage: 'view', seatKey: A } });
    expect(onViewChange).toHaveBeenCalledTimes(1);
    act(() => picker.result.current.actions.backToMap());
    expect(onViewChange).toHaveBeenLastCalledWith({ stage: 'map' });
    expect(picker.result.current.target).toBe('view');
    picker.rerender({ ...props, view: { stage: 'view', seatKey: B } });
    expect(onViewChange).toHaveBeenCalledTimes(2);
  });

  it('select intent requests a controlled view, while an invalid host view reports only invalidity', () => {
    const onViewChange = vi.fn();
    const onInvalidView = vi.fn();
    const props: Partial<SeatPickerRootProps> = {
      view: { stage: 'map' },
      selection: { mode: 'single', openViewOn: 'select' },
      onViewChange,
      onInvalidView,
    };
    const picker = model(props);
    act(() => picker.result.current.actions.activate(A));
    expect(onViewChange).toHaveBeenCalledWith({ stage: 'view', seatKey: A });
    expect(picker.result.current.target).toBe('map');
    picker.rerender({ ...props, view: { stage: 'view', seatKey: 'unknown' } });
    expect(onInvalidView).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledTimes(1);
  });

  it('keeps a deep link on the inert map until availability arrives, then selects and opens it', () => {
    const onInvalidView = vi.fn();
    const onValueChange = vi.fn();
    const props: Partial<SeatPickerRootProps> = {
      view: { stage: 'view', seatKey: B },
      occupancy: undefined,
      onInvalidView,
      onValueChange,
    };
    const picker = model(props);
    expect(picker.result.current.target).toBe('map');
    expect(picker.result.current.viewMounted).toBe(false);
    expect(onInvalidView).not.toHaveBeenCalled();
    picker.rerender({ ...props, occupancy: { revision: 1 } });
    expect(picker.result.current.target).toBe('view');
    expect(picker.result.current.selected).toEqual([B]);
    expect(onValueChange).toHaveBeenCalledWith([B]);
    expect(picker.result.current.total).toBe(1250);
  });

  it.each(['unknown', 'taken', 'blocked', 'held'] as const)(
    'rejects a deferred %s deep link without hiding the map',
    (status) => {
      const onInvalidView = vi.fn();
      const key = status === 'unknown' ? 'unknown' : A;
      const props: Partial<SeatPickerRootProps> = {
        view: { stage: 'view', seatKey: key },
        occupancy: undefined,
        onInvalidView,
      };
      const picker = model(props);
      const occupancy: Occupancy = {
        revision: 1,
        ...(status === 'taken'
          ? { taken: [A] }
          : status === 'blocked'
            ? { blocked: [A] }
            : status === 'held'
              ? { held: [{ key: A }] }
              : {}),
      };
      picker.rerender({ ...props, occupancy });
      expect(picker.result.current.target).toBe('map');
      expect(picker.result.current.viewMounted).toBe(false);
      expect(picker.result.current.controller.phaseValue('crossfade')).toBe(0);
      expect(onInvalidView).toHaveBeenCalledTimes(1);
    },
  );

  it('adds the focused seat in multiple mode only while the max permits', () => {
    const picker = model({
      defaultValue: [A],
      defaultView: { stage: 'view', seatKey: B },
      selection: { mode: 'multiple', max: 2 },
    });
    expect(picker.result.current.selected).toEqual([A, B]);
    act(() => picker.result.current.actions.openView(C));
    expect(picker.result.current.seatKey).toBe(C);
    expect(picker.result.current.selected).toEqual([A, B]);
    expect(picker.result.current.state.message).toEqual({ kind: 'maxSeats', max: 2 });
  });
});

describe('booking without a revision (A5)', () => {
  it('keeps ownership until the next accepted snapshot even when success omits revision', async () => {
    const onBook = vi.fn(async (): Promise<BookResult> => ({
      ok: true,
      data: null,
      hold: { expiresAt: expiry },
    }));
    const picker = model({ defaultValue: [A], onBook });
    await book(picker);
    expect(picker.result.current.effectiveStatus(A)).toBe('held');
    expect(picker.result.current.holdExpiresAt).toBe(expiry);
    await book(picker);
    expect(onBook).toHaveBeenCalledTimes(1);
    picker.rerender({ occupancy: { revision: 2 }, onBook });
    expect(picker.result.current.effectiveStatus(A)).toBe('available');
  });
});

describe('loading gaps do not reconfirm stale snapshots (F02, F04, F07)', () => {
  it('keeps conflict marks when a loading gap returns only older occupancy', async () => {
    const onBook = vi.fn(async (): Promise<BookResult> => ({
      ok: false,
      reason: 'conflict',
      keys: [A],
    }));
    const picker = model({ value: [A], occupancy: { revision: 10 }, onBook });
    await book(picker);
    picker.rerender({ value: [A], occupancy: undefined, onBook });
    picker.rerender({ value: [A], occupancy: { revision: 9 }, onBook });
    expect(picker.result.current.effectiveStatus(A)).toBe('taken');
    await book(picker);
    expect(onBook).toHaveBeenCalledTimes(1);
  });
  it('does not rebase clock skew on the old server timestamp after a loading gap', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    const picker = model({
      value: [A],
      occupancy: {
        revision: 10,
        serverNow: '2030-01-01T00:00:30Z',
        held: [{ key: A, mine: true, expiresAt: expiry }],
      },
    });
    expect(picker.result.current.holdSkewMs).toBe(30_000);
    picker.rerender({ value: [A], occupancy: undefined });
    act(() => vi.advanceTimersByTime(5000));
    picker.rerender({ value: [A], occupancy: { revision: 9 } });
    expect(picker.result.current.holdSkewMs).toBe(30_000);
    expect(picker.result.current.holdExpiresAt).toBe(expiry);
  });
});

describe('invalid user view intent (A1, F14)', () => {
  it('reports an invalid intent once, leaves the map visible and never selects the unknown seat', () => {
    const onViewChange = vi.fn(),
      onInvalidView = vi.fn(),
      onValueChange = vi.fn();
    const picker = model({ onViewChange, onInvalidView, onValueChange });
    act(() => picker.result.current.actions.openView('unknown'));
    expect(onViewChange).toHaveBeenCalledExactlyOnceWith({ stage: 'view', seatKey: 'unknown' });
    expect(onInvalidView).toHaveBeenCalledTimes(1);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(picker.result.current.target).toBe('map');
    expect(picker.result.current.controller.phaseValue('crossfade')).toBe(0);
  });
});
