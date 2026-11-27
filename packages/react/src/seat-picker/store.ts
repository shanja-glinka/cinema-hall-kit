import {
  compareRevisions,
  createStatusLookup,
  type BookResult,
  type Occupancy,
  type Price,
  type SeatKey,
  type SeatStatus,
  type SelectionViolation,
} from '@cinema-hall/core';
import type { BookingStatus, ConfirmResult } from './types.js';

/** An occupancy revision: a number or a string (compared with core `compareRevisions`). */
export type Revision = number | string;

/** A message shown in the footer or the details: conflict, lost seats, max reached, price change, closed sales or a plain error. */
export type PickerMessage =
  | { kind: 'conflict'; keys: SeatKey[] }
  | { kind: 'selectionLost'; keys: SeatKey[] }
  | { kind: 'maxSeats'; max: number }
  | { kind: 'priceChanged' }
  | { kind: 'closed' }
  /** `text`: the explanation `onBook` returned with `reason: 'error'`, shown instead of the generic text. */
  | { kind: 'error'; text?: string }
  /** `text`: the explanation `onConfirm` returned with the refusal, shown instead of the generic text. */
  | { kind: 'confirmError'; text?: string }
  | { kind: 'holdExpired'; text?: string };

/** Seats this viewer bought through `onConfirm`, with the ticket number the host returned. */
export interface Purchase {
  keys: SeatKey[];
  ticket: string | null;
  /**
   * Price of each bought seat at the moment the viewer confirmed (`null`: no price). The summary
   * of a completed purchase shows these, not the current pricing.
   */
  prices?: Partial<Record<SeatKey, Price | null>>;
}

/** A booking this viewer just made, shown as held until the server confirms it at `revision`. */
export interface LocalMine {
  keys: SeatKey[];
  /** Server revision that confirms the hold; `null` clears on the next occupancy. */
  revision: Revision | null;
  expiresAt: string | null;
}

/** Seats a snapshot took from the selection, reported once through `onSelectionLost`. */
export interface LostEvent {
  id: number;
  keys: SeatKey[];
  cause: SeatStatus;
}

/** Booking, messages and occupancy bookkeeping. The selection itself is controlled separately. */
export interface PickerState {
  focusKey: SeatKey | null;
  status: BookingStatus;
  /** Idempotency key of the current booking attempt; kept while the selection is unchanged. */
  attempt: { key: string; id: string } | null;
  message: PickerMessage | null;
  violations: SelectionViolation[];
  /** Seats the server reported as taken after a conflict, until a snapshot at their revision. */
  localTaken: { key: SeatKey; revision: Revision }[];
  /** Seats this viewer just booked, shown as held until the server catches up. */
  mine: LocalMine[];
  /** Booking expiry retained while the corresponding own hold is confirmed on the server. */
  holdExpiries: Record<SeatKey, string>;
  /** Revision of the accepted occupancy snapshot. */
  lastRevision: Revision | null;
  lostEvent: LostEvent | null;
  /** Seats bought through `onConfirm`. */
  purchases: Purchase[];
  /** The purchase step: `onConfirm` running, or the last one failed. */
  confirm: 'idle' | 'confirming' | 'error';
  /**
   * `attemptKey` of the seats the last failed `onConfirm` was about: its `holdExpired` or
   * `confirmError` message only applies while those seats are the selection.
   */
  confirmKey: string | null;
  /**
   * `attemptKey` of the current selection (the seats still to buy), from the last
   * `selectionChanged`; `null` until the selection first changes. A purchase refusal that arrives
   * for other seats than these is stale and leaves the current selection alone.
   */
  selectionKey: string | null;
  /**
   * The seats behind `selectionKey` (the selection minus seats already bought), so a purchase that
   * goes through can drop its seats from the key.
   */
  selectionKeys: SeatKey[] | null;
}

/** Actions of `pickerReducer`. */
export type PickerAction =
  | { type: 'focus'; key: SeatKey | null }
  | { type: 'selectionChanged'; keys: readonly SeatKey[] }
  | { type: 'message'; message: PickerMessage | null }
  | { type: 'violations'; list: SelectionViolation[] }
  | { type: 'bookStart'; attemptKey: string; attemptId: string }
  | { type: 'bookResult'; result: BookResult; keys: SeatKey[] }
  | { type: 'occupancy'; occupancy: Occupancy; lost: SeatKey[]; cause: SeatStatus }
  /** Seats the accepted snapshot takes away, found after a purchase that protected them settled. */
  | { type: 'lost'; lost: SeatKey[]; cause: SeatStatus }
  | { type: 'confirmStart' }
  | {
      type: 'confirmResult';
      result: ConfirmResult;
      keys: SeatKey[];
      /** Price of each confirmed seat when the purchase started. */
      prices?: Partial<Record<SeatKey, Price | null>>;
    };

/**
 * The state of a picker that has not done anything yet.
 * @returns A fresh `PickerState`.
 */
export function initialPickerState(): PickerState {
  return {
    focusKey: null,
    status: 'idle',
    attempt: null,
    message: null,
    violations: [],
    localTaken: [],
    mine: [],
    holdExpiries: {},
    lastRevision: null,
    lostEvent: null,
    purchases: [],
    confirm: 'idle',
    confirmKey: null,
    selectionKey: null,
    selectionKeys: null,
  };
}

/**
 * Order-independent key of a selection, to tell whether a booking attempt may be reused.
 * @param keys - Selected seat keys.
 * @returns The sorted keys joined with `|`.
 */
export function attemptKey(keys: readonly SeatKey[]): string {
  return [...keys].sort().join('|');
}

/**
 * Reducer of the booking, message and occupancy bookkeeping.
 * @param state - Current state.
 * @param action - What happened.
 * @returns The next state (the same object when nothing changed).
 */
export function pickerReducer(state: PickerState, action: PickerAction): PickerState {
  switch (action.type) {
    case 'focus':
      return state.focusKey === action.key ? state : { ...state, focusKey: action.key };

    case 'selectionChanged': {
      const key = attemptKey(action.keys);
      return {
        ...state,
        violations: [],
        message:
          state.message?.kind === 'maxSeats' ||
          state.message?.kind === 'selectionLost' ||
          // A refused purchase is about the seats it confirmed: another selection (for example a
          // different, still active hold) starts over.
          ((state.message?.kind === 'holdExpired' || state.message?.kind === 'confirmError') &&
            key !== state.confirmKey)
            ? null
            : state.message,
        status: state.status === 'booking' ? 'booking' : 'idle',
        confirm: state.confirm === 'confirming' ? 'confirming' : 'idle',
        attempt: state.attempt && state.attempt.key === key ? state.attempt : null,
        selectionKey: key,
        selectionKeys: [...action.keys],
      };
    }

    case 'message':
      return { ...state, message: action.message };

    case 'violations':
      return { ...state, violations: action.list };

    case 'bookStart': {
      if (state.status === 'booking') return state;
      const attempt =
        state.attempt && state.attempt.key === action.attemptKey
          ? state.attempt
          : { key: action.attemptKey, id: action.attemptId };
      return { ...state, status: 'booking', attempt, message: null };
    }

    case 'bookResult':
      return applyBookResult(state, action.result, action.keys);

    case 'occupancy':
      return applyOccupancy(state, action);

    case 'lost':
      return action.lost.length === 0 ? state : { ...state, ...lostFields(state, action) };

    case 'confirmStart':
      return state.confirm === 'confirming'
        ? state
        : { ...state, confirm: 'confirming', message: null };

    case 'confirmResult': {
      if (!action.result.ok) {
        const refusedKey = attemptKey(action.keys);
        // The viewer moved on to other seats while `onConfirm` ran (for example another, still
        // active hold): the late refusal is about seats no longer selected, so it neither shows its
        // message nor blocks buying the current selection.
        if (state.selectionKey !== null && state.selectionKey !== refusedKey) {
          return { ...state, confirm: 'idle' };
        }
        const kind = action.result.reason === 'expired' ? 'holdExpired' : 'confirmError';
        const text = action.result.message?.trim();
        return {
          ...state,
          confirm: 'error',
          confirmKey: refusedKey,
          message: text ? { kind, text } : { kind },
        };
      }
      const keys = [...new Set(action.keys)];
      // The bought seats are no longer the ones to buy: a later refusal for the rest of the
      // selection is compared with what is still unpaid.
      const remaining = state.selectionKeys?.filter((key) => !keys.includes(key)) ?? null;
      return {
        ...state,
        selectionKey: remaining === null ? state.selectionKey : attemptKey(remaining),
        selectionKeys: remaining,
        confirm: 'idle',
        message: null,
        purchases: [
          ...state.purchases
            .map((item) => ({ ...item, keys: item.keys.filter((key) => !keys.includes(key)) }))
            .filter((item) => item.keys.length > 0),
          action.prices
            ? { keys, ticket: action.result.ticket ?? null, prices: action.prices }
            : { keys, ticket: action.result.ticket ?? null },
        ],
        holdExpiries: Object.fromEntries(
          Object.entries(state.holdExpiries).filter(([key]) => !keys.includes(key)),
        ),
      };
    }
  }
}

function applyBookResult(state: PickerState, result: BookResult, keys: SeatKey[]): PickerState {
  if (result.ok) {
    // A result the accepted snapshot has already caught up with adds no local mark: the snapshot is
    // the truth (it shows the hold, or shows that someone else took the seats since).
    const superseded =
      result.revision !== undefined &&
      state.lastRevision !== null &&
      compareRevisions(state.lastRevision, result.revision) >= 0;
    // The attempt stays: a repeated press for the same seats must not book them twice.
    return {
      ...state,
      status: 'idle',
      message: null,
      mine: superseded
        ? state.mine
        : [
            ...state.mine
              .map((mark) => ({ ...mark, keys: mark.keys.filter((key) => !keys.includes(key)) }))
              .filter((mark) => mark.keys.length > 0),
            {
              keys: [...new Set(keys)],
              revision: result.revision ?? null,
              expiresAt: result.hold?.expiresAt ?? null,
            },
          ],
      // A superseded result changes no hold metadata either: the snapshot is the truth.
      holdExpiries: superseded
        ? state.holdExpiries
        : Object.fromEntries([
            ...Object.entries(state.holdExpiries).filter(([key]) => !keys.includes(key)),
            ...(result.hold ? keys.map((key) => [key, result.hold!.expiresAt] as const) : []),
          ]),
    };
  }
  switch (result.reason) {
    case 'conflict': {
      const conflicting = [...new Set(result.keys)];
      const revision = state.lastRevision ?? 0;
      return {
        ...state,
        status: 'conflict',
        message: { kind: 'conflict', keys: conflicting },
        localTaken: [...state.localTaken, ...conflicting.map((key) => ({ key, revision }))],
      };
    }
    case 'price_changed':
      return { ...state, status: 'error', message: { kind: 'priceChanged' } };
    case 'closed':
      return { ...state, status: 'error', message: { kind: 'closed' } };
    case 'error': {
      // Like a refused purchase: the host's explanation (when it gave one) replaces the generic text.
      const text = result.message?.trim();
      return {
        ...state,
        status: 'error',
        message: text ? { kind: 'error', text } : { kind: 'error' },
      };
    }
  }
}

/**
 * Applies the accepted snapshot. Conflict marks are released once a snapshot reaches their revision
 * (`>=`), and the own hold is released at its confirming revision. Seats that were selected and are
 * no longer available are reported as lost (the caller removes them from the selection).
 */
function applyOccupancy(
  state: PickerState,
  action: Extract<PickerAction, { type: 'occupancy' }>,
): PickerState {
  const revision = action.occupancy.revision;
  const localTaken = state.localTaken.filter(
    (mark) => compareRevisions(revision, mark.revision) < 0,
  );
  const mine = pendingOwnership(state.mine, action.occupancy);
  const owned = new Set([
    ...mine.flatMap((mark) => mark.keys),
    ...(action.occupancy.held ?? []).filter((hold) => hold.mine).map((hold) => hold.key),
  ]);
  const holdExpiries = Object.fromEntries([
    ...Object.entries(state.holdExpiries).filter(([key]) => owned.has(key)),
    ...(action.occupancy.held ?? []).flatMap((hold) =>
      hold.mine && hold.expiresAt ? [[hold.key, hold.expiresAt] as const] : [],
    ),
  ]);
  return {
    ...state,
    localTaken,
    mine,
    holdExpiries,
    lastRevision: revision,
    ...lostFields(state, action),
  };
}

/** The lost-seat report of a snapshot: an event for `onSelectionLost` and the footer message. */
function lostFields(
  state: PickerState,
  action: { lost: SeatKey[]; cause: SeatStatus },
): Pick<PickerState, 'lostEvent' | 'violations' | 'message'> {
  const lost = action.lost;
  return {
    lostEvent:
      lost.length > 0
        ? { id: (state.lostEvent?.id ?? 0) + 1, keys: lost, cause: action.cause }
        : state.lostEvent,
    violations: lost.length > 0 ? [] : state.violations,
    message: lost.length > 0 ? { kind: 'selectionLost', keys: lost } : state.message,
  };
}

/**
 * Which selected seats the snapshot takes away. Own holds (local, or `mine` on the server) stay.
 * @param selected - Current selection.
 * @param occupancy - The accepted snapshot.
 * @param mine - Local ownership marks (a single mark, a list, or `null`).
 * @returns The seats kept, the seats lost and the status that took the first lost seat.
 */
export function findLostSeats(
  selected: readonly SeatKey[],
  occupancy: Occupancy,
  mine: readonly LocalMine[] | LocalMine | null,
): { kept: SeatKey[]; lost: SeatKey[]; cause: SeatStatus } {
  const lookup = createStatusLookup(occupancy);
  const marks = mine === null ? [] : Array.isArray(mine) ? mine : [mine as LocalMine];
  const mineLocal = new Set(pendingOwnership(marks, occupancy).flatMap((mark) => mark.keys));
  const mineOnServer = new Set((occupancy.held ?? []).filter((h) => h.mine).map((h) => h.key));
  const kept: SeatKey[] = [];
  const lost: SeatKey[] = [];
  let cause: SeatStatus = 'taken';
  for (const key of selected) {
    if (mineLocal.has(key) || mineOnServer.has(key)) {
      kept.push(key);
      continue;
    }
    const status = lookup(key);
    if (status === 'available') {
      kept.push(key);
      continue;
    }
    if (lost.length === 0) cause = status;
    lost.push(key);
  }
  return { kept, lost, cause };
}

/**
 * Each booking owns its confirmation revision; a later booking cannot replace an earlier one.
 * @param marks - Local ownership marks.
 * @param occupancy - The accepted snapshot, or `undefined` while loading.
 * @returns The marks the snapshot has not yet confirmed.
 */
export function pendingOwnership(
  marks: readonly LocalMine[],
  occupancy: Occupancy | undefined,
): LocalMine[] {
  return marks.filter(
    (mark) =>
      occupancy === undefined ||
      (mark.revision !== null && compareRevisions(occupancy.revision, mark.revision) < 0),
  );
}
