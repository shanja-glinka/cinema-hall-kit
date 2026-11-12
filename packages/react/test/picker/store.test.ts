import { describe, expect, it } from 'vitest';
import type { BookResult, Occupancy } from '@cinema-hall/core';
import {
  attemptKey,
  findLostSeats,
  initialPickerState,
  pickerReducer,
  type PickerAction,
  type PickerState,
} from '../../src/seat-picker/store.js';
import { normalizeBookResult, runBook } from '../../src/seat-picker/booking.js';

const run = (state: PickerState, ...actions: PickerAction[]) =>
  actions.reduce(pickerReducer, state);

const snapshot = (revision: number, extra: Partial<Occupancy> = {}): Occupancy => ({
  revision,
  ...extra,
});

/** Applies a snapshot the way the model does: find the lost seats, then reduce. */
function applySnapshot(state: PickerState, occupancy: Occupancy, selected: string[] = []) {
  const found = findLostSeats(selected, occupancy, state.mine);
  return pickerReducer(state, {
    type: 'occupancy',
    occupancy,
    lost: found.lost,
    cause: found.cause,
  });
}

describe('lost seats', () => {
  it('reports a selected seat that someone else took, and keeps the rest', () => {
    const found = findLostSeats(['a', 'b'], snapshot(5, { taken: ['b'] }), null);
    expect(found.kept).toEqual(['a']);
    expect(found.lost).toEqual(['b']);
    expect(found.cause).toBe('taken');
    const state = applySnapshot(initialPickerState(), snapshot(5, { taken: ['b'] }), ['a', 'b']);
    expect(state.message).toEqual({ kind: 'selectionLost', keys: ['b'] });
    expect(state.lostEvent?.keys).toEqual(['b']);
    expect(state.lostEvent?.cause).toBe('taken');
  });

  it('keeps an own hold, both the server one and the local one before its revision', () => {
    expect(
      findLostSeats(['a'], snapshot(6, { held: [{ key: 'a', mine: true }] }), null).lost,
    ).toEqual([]);
    const mine = { keys: ['a'], revision: 6, expiresAt: null };
    expect(findLostSeats(['a'], snapshot(5, { taken: ['a'] }), mine).lost).toEqual([]);
    expect(findLostSeats(['a'], snapshot(6, { taken: ['a'] }), mine).lost).toEqual(['a']);
  });
});

describe('booking state', () => {
  it('a conflict mark is released at the conflict revision, not only after a newer one', () => {
    let state = applySnapshot(initialPickerState(), snapshot(7));
    state = run(
      state,
      { type: 'bookStart', attemptKey: 'a|b', attemptId: 'id' },
      {
        type: 'bookResult',
        result: { ok: false, reason: 'conflict', keys: ['b'] },
        keys: ['a', 'b'],
      },
    );
    expect(state.status).toBe('conflict');
    expect(state.message).toEqual({ kind: 'conflict', keys: ['b'] });
    expect(state.localTaken).toEqual([{ key: 'b', revision: 7 }]);
    state = applySnapshot(state, snapshot(7));
    expect(state.localTaken).toEqual([]);
  });

  it('ok keeps the attempt, holds the seats as mine, and clears them at the confirming revision', () => {
    let state = run(
      applySnapshot(initialPickerState(), snapshot(4)),
      { type: 'bookStart', attemptKey: 'a', attemptId: 'id-1' },
      {
        type: 'bookResult',
        result: {
          ok: true,
          data: null,
          revision: 6,
          hold: { expiresAt: '2030-01-01T00:00:00Z' },
        },
        keys: ['a'],
      },
    );
    expect(state.status).toBe('idle');
    expect(state.attempt).toEqual({ key: 'a', id: 'id-1' });
    expect(state.mine).toEqual([{ keys: ['a'], revision: 6, expiresAt: '2030-01-01T00:00:00Z' }]);
    state = applySnapshot(state, snapshot(5, { held: [{ key: 'a' }] }), ['a']);
    expect(state.mine).toHaveLength(1);
    state = applySnapshot(state, snapshot(6, { held: [{ key: 'a', mine: true }] }), ['a']);
    expect(state.mine).toEqual([]);
  });

  it('a changed selection drops the attempt, so the next book is a new attempt', () => {
    const state = run(
      initialPickerState(),
      { type: 'bookStart', attemptKey: 'a', attemptId: 'id' },
      { type: 'selectionChanged', keys: ['a', 'b'] },
    );
    expect(state.attempt).toBeNull();
  });

  it('a second press while booking is ignored', () => {
    const started = run(initialPickerState(), {
      type: 'bookStart',
      attemptKey: 'a',
      attemptId: 'id-1',
    });
    expect(started.status).toBe('booking');
    const again = pickerReducer(started, { type: 'bookStart', attemptKey: 'a', attemptId: 'id-2' });
    expect(again).toBe(started);
    expect(again.attempt?.id).toBe('id-1');
  });

  it('price changes and closed sales become error messages', () => {
    const state = run(initialPickerState(), {
      type: 'bookResult',
      result: { ok: false, reason: 'price_changed' },
      keys: ['a'],
    });
    expect(state.status).toBe('error');
    expect(state.message).toEqual({ kind: 'priceChanged' });
  });

  it('attempt keys do not depend on the order of the seats', () => {
    expect(attemptKey(['b', 'a'])).toBe(attemptKey(['a', 'b']));
  });
});

describe('booking results', () => {
  it('a thrown error becomes a plain error result', async () => {
    const result = await runBook(
      () => {
        throw new Error('network down');
      },
      ['a'],
      [],
      'id',
      new AbortController().signal,
    );
    expect(result).toEqual({ ok: false, reason: 'error', retryable: true });
  });

  it('normalises unknown shapes to an error and checks each variant', () => {
    expect(normalizeBookResult(null)).toEqual({ ok: false, reason: 'error' });
    expect(normalizeBookResult({ ok: false, reason: 'surprise' })).toEqual({
      ok: false,
      reason: 'error',
    });
    expect(normalizeBookResult({ ok: true, data: 1 })).toEqual({ ok: true, data: 1 });
  });

  it('passes the same attempt id and the seen prices to onBook', async () => {
    const seen: { attemptId: string; prices: unknown }[] = [];
    const onBook = (keys: string[], ctx: { attemptId: string; prices: unknown }) => {
      seen.push({ attemptId: ctx.attemptId, prices: ctx.prices });
      return Promise.resolve({ ok: true as const, data: keys });
    };
    const prices = [{ key: 'a', price: 1250 }];
    await runBook(onBook, ['a'], prices, 'attempt-1', new AbortController().signal);
    expect(seen).toEqual([{ attemptId: 'attempt-1', prices }]);
  });

  it('conflict results keep their seat keys, and a conflict without keys is an error', () => {
    const result: BookResult = { ok: false, reason: 'conflict', keys: ['b'] };
    expect(normalizeBookResult(result)).toEqual(result);
    expect(normalizeBookResult({ ok: false, reason: 'conflict', keys: 'b' })).toEqual({
      ok: false,
      reason: 'error',
    });
    expect(normalizeBookResult({ ok: true })).toEqual({ ok: false, reason: 'error' });
  });
});
