import {
  compareRevisions,
  createStatusLookup,
  type BookResult,
  type Occupancy,
  type SeatKey,
  type SeatStatus,
  type SelectionViolation,
} from '@cinema-hall/core';
import type { BookingStatus } from './types.js';

/** An occupancy revision: a number or a string (compared with core `compareRevisions`). */
export type Revision = number | string;

/** A message shown in the footer or the details: conflict, lost seats, max reached, price change, closed sales or a plain error. */
export type PickerMessage =
  | { kind: 'conflict'; keys: SeatKey[] }
  | { kind: 'selectionLost'; keys: SeatKey[] }
  | { kind: 'maxSeats'; max: number }
  | { kind: 'priceChanged' }
  | { kind: 'closed' }
  | { kind: 'error' };

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
}

/** Actions of `pickerReducer`. */
export type PickerAction =
  | { type: 'focus'; key: SeatKey | null }
  | { type: 'selectionChanged'; keys: readonly SeatKey[] }
  | { type: 'message'; message: PickerMessage | null }
  | { type: 'violations'; list: SelectionViolation[] }
  | { type: 'bookStart'; attemptKey: string; attemptId: string }
  | { type: 'bookResult'; result: BookResult; keys: SeatKey[] }
  | { type: 'occupancy'; occupancy: Occupancy; lost: SeatKey[]; cause: SeatStatus };

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
          state.message?.kind === 'maxSeats' || state.message?.kind === 'selectionLost'
            ? null
            : state.message,
        status: state.status === 'booking' ? 'booking' : 'idle',
        attempt: state.attempt && state.attempt.key === key ? state.attempt : null,
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
    case 'error':
      return { ...state, status: 'error', message: { kind: 'error' } };
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
  const lost = action.lost;
  return {
    ...state,
    localTaken,
    mine,
    holdExpiries,
    lastRevision: revision,
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
