import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
} from 'react';
import {
  buildHallLayout,
  createStatusLookup,
  priceForSeat,
  resolvePricing,
  sumPrices,
  validateSelection,
  type Avatars,
  type BookResult,
  type HallLayout,
  type Price,
  type Occupancy,
  type Pricing,
  type ScreenContent,
  type Seat,
  type SeatKey,
  type SeatStatus,
} from '@cinema-hall/core';
import { useCinemaHall, type ResolvedOptions } from '../provider/provider.js';
import type { FlightOptions, SceneOptions } from '../scene/types.js';
import type { FlightEvent, SeatViewHandle } from '../seat-view/SeatView.js';
import type { SheetSkin } from '../sheet/GlassSheet.js';
import { DEFAULT_SNAP_POINTS, type SnapValue } from '../sheet/snap.js';
import type { TransitionController, TransitionProgress } from '../transitions/controller.js';
import { sameConfig } from '../transitions/compare.js';
import type { PhaseName } from '../transitions/presets.js';
import {
  resolveTransition,
  type Direction,
  type ResolvedTransition,
  type Target,
} from '../transitions/timeline.js';
import { newAttemptId, priceRows, runBook, runConfirm } from './booking.js';
import {
  attemptKey,
  findLostSeats,
  initialPickerState,
  pickerReducer,
  type PickerAction,
  type PickerState,
} from './store.js';
import { canonicalKeys, sameKeys, toggleSeat, uniqueKeys } from './selection.js';
import { useAcceptedOccupancy } from './use-accepted-occupancy.js';
import { useControllable } from './use-controllable.js';
import { useTransitionOrchestrator, type SheetTween } from './use-transition-orchestrator.js';
import type { PurchaseStatus, SeatPickerRootProps, SelectionMode, ViewState } from './types.js';

/** The sheet options with their defaults applied. */
export interface ResolvedSheet {
  snapPoints: SnapValue[];
  initialSnap: SnapValue;
  skin: SheetSkin;
  dimScene: boolean;
  dismissible: boolean;
}

/** What the parts can ask the picker to do. */
export interface PickerActions {
  activate(key: SeatKey): void;
  select(key: SeatKey): void;
  deselect(key: SeatKey): void;
  focus(key: SeatKey): void;
  continueToView(): void;
  openView(key?: SeatKey): void;
  backToMap(): void;
  book(): void;
  /** Runs `onConfirm` for the reserved selection. */
  confirm(): void;
  resetLook(): void;
}

/** Everything the parts read. Created once per picker by `usePickerModel`. */
export interface PickerModel {
  layout: HallLayout;
  options: ResolvedOptions;
  state: PickerState;
  dispatch: Dispatch<PickerAction>;
  /** The accepted occupancy snapshot: the only one the picker acts on. */
  occupancy: Occupancy | undefined;
  inert: boolean;
  selectionMode: SelectionMode;
  /** The selection as the host sees it (controlled) or the picker keeps it (uncontrolled). */
  selected: SeatKey[];
  /** The selection is the seats this viewer just booked. */
  booked: boolean;
  /** Seats this viewer holds or bought: drawn as "yours" on the map. */
  isMine(key: SeatKey): boolean;
  /** Seats of this viewer's active hold (not bought): they can be selected again. */
  isOwnHold(key: SeatKey): boolean;
  /** The host passed `onConfirm`: a reservation offers the purchase step. */
  confirmable: boolean;
  /**
   * The optional purchase step for the current selection. `ticket` is the ticket of the latest
   * purchase among the selected seats; `tickets` lists every ticket of the selected seats, oldest
   * purchase first.
   */
  purchase: { status: PurchaseStatus; ticket: string | null; tickets: string[] };
  /** Goal of the transition: `view` once the view is requested and the seat is valid. */
  target: Target;
  /** The seat the view is about (`null` on the map). */
  seatKey: SeatKey | null;
  /** Seat the camera is at or flying to (`null` = overview). */
  cameraKey: SeatKey | null;
  controller: TransitionController;
  resolved: ResolvedTransition;
  flight: FlightOptions | false;
  transition: { phase: PhaseName | null; direction: Direction | null };
  phases: Record<PhaseName, TransitionProgress>;
  viewMounted: boolean;
  sheetOpen: boolean;
  sheetInstant: boolean;
  sheetTween: SheetTween | undefined;
  onFlight(event: FlightEvent): void;
  onViewReady(available: boolean): void;
  sheet: ResolvedSheet | null;
  rootEl: HTMLElement | null;
  setRootEl: (el: HTMLElement | null) => void;
  viewEl: HTMLElement | null;
  setViewEl: (el: HTMLElement | null) => void;
  webgl: boolean | null;
  pricing: Pricing | undefined;
  avatars: Avatars | undefined;
  screen: ScreenContent | undefined;
  scene: SceneOptions | undefined;
  seatByKey: Map<SeatKey, Seat>;
  effectiveStatus(key: SeatKey): SeatStatus;
  priceOf(key: SeatKey): Price | null;
  format(price: Price | null): string;
  total: Price | null;
  holdExpiresAt: string | null;
  holdNowMs: number;
  holdSkewMs: number;
  seatViewRef: RefObject<SeatViewHandle | null>;
  layoutMode: 'contained' | 'fullscreen';
  desktop: boolean;
  /** The root is narrower than 400 px: labels shrink and the Continue button drops its price. */
  narrow: boolean;
  /** Height of the picker root in pixels (0 until measured). */
  rootHeight: number;
  previewKey: SeatKey | null;
  actions: PickerActions;
}

/** Root width below which the mobile footer uses its compact labels. */
const NARROW_ROOT_PX = 400;

function canUseWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * The picker's behaviour: selection, the view request, booking and occupancy. The transition itself
 * is `useTransitionOrchestrator`. Only the root calls this; the parts read the result through context.
 * @param props - The root props.
 * @returns The model every part reads.
 * @example
 * ```tsx
 * const model = usePickerModel(props);
 * return <PickerContext.Provider value={model}>{children}</PickerContext.Provider>;
 * ```
 */
export function usePickerModel<TData = unknown>(props: SeatPickerRootProps<TData>): PickerModel {
  const options = useCinemaHall({
    theme: props.theme,
    labels: props.labels,
    locale: props.locale,
    slots: props.slots,
    classNames: props.classNames,
    formatPrice: props.formatPrice,
  });

  // Keyed by value, so an inline `layoutOptions={{ enforce: true }}` does not rebuild every render.
  const layoutOptionsKey = props.layoutOptions ? JSON.stringify(props.layoutOptions) : '';
  const layout = useMemo<HallLayout>(() => {
    if (props.layout) return props.layout;
    if (!props.config) throw new Error('SeatPicker: pass `config` or `layout`.');
    return props.layoutOptions
      ? buildHallLayout(props.config, props.layoutOptions)
      : buildHallLayout(props.config);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layoutOptions is compared by value
  }, [props.layout, props.config, layoutOptionsKey]);

  const occupancy = useAcceptedOccupancy(props.occupancy);
  const inert = occupancy === undefined;
  const selectionMode: SelectionMode = props.selection ?? { mode: 'single' };

  const [state, dispatch] = useReducer(pickerReducer, undefined, initialPickerState);
  const selection = useControllable<SeatKey[]>(
    props.value,
    uniqueKeys(props.defaultValue ?? []),
    props.onValueChange,
  );
  const layoutOrder = useMemo(() => layout.seats.map((seat) => seat.key), [layout]);
  const selected = useMemo(
    () => canonicalKeys(selection.value, layoutOrder),
    [selection.value, layoutOrder],
  );
  const readSelection = () => canonicalKeys(selection.read(), layoutOrder);
  // Only an accepted value invalidates an attempt. A controlled request may be refused by the host.
  const [acceptedSelection, setAcceptedSelection] = useState(selected);
  if (!sameKeys(acceptedSelection, selected)) {
    setAcceptedSelection(selected);
    // The attempt is about the seats still to reserve: bought seats are not part of it.
    const bought = new Set(state.purchases.flatMap((item) => item.keys));
    dispatch({ type: 'selectionChanged', keys: selected.filter((key) => !bought.has(key)) });
  }

  const seatByKey = useMemo(
    () => new Map(layout.seats.map((seat) => [seat.key, seat] as const)),
    [layout],
  );
  const seatSet = useMemo(() => new Set(seatByKey.keys()), [seatByKey]);
  const serverStatus = useMemo(() => createStatusLookup(occupancy), [occupancy]);
  const acceptedMine = useMemo(
    () => new Set((occupancy?.held ?? []).filter((hold) => hold.mine).map((hold) => hold.key)),
    [occupancy],
  );
  const pendingMine = state.mine;
  const purchasedTickets = useMemo(
    () =>
      new Map(
        state.purchases.flatMap((item) => item.keys.map((key) => [key, item.ticket] as const)),
      ),
    [state.purchases],
  );
  // The price each bought seat had when the viewer confirmed it.
  const purchasedPrices = useMemo(
    () =>
      new Map(
        state.purchases.flatMap((item) =>
          item.prices
            ? item.keys.flatMap((key) =>
                key in item.prices! ? [[key, item.prices![key] ?? null] as const] : [],
              )
            : [],
        ),
      ),
    [state.purchases],
  );
  // A seat of the viewer's own active hold (not bought yet): it can be picked again after it was
  // deselected, for example to restore a reservation the server kept whole.
  const isOwnHold = (key: SeatKey): boolean =>
    !purchasedTickets.has(key) &&
    (pendingMine.some((mark) => mark.keys.includes(key)) || acceptedMine.has(key));
  const isMineSeat = (key: SeatKey): boolean =>
    purchasedTickets.has(key) ||
    pendingMine.some((mark) => mark.keys.includes(key)) ||
    acceptedMine.has(key);
  const effectiveStatus = (key: SeatKey): SeatStatus => {
    if (state.localTaken.some((mark) => mark.key === key)) return 'taken';
    if (isMineSeat(key)) return 'held';
    return serverStatus(key);
  };

  const pricing = useMemo(
    () => resolvePricing(layout.pricing, props.pricing),
    [layout.pricing, props.pricing],
  );
  const priceOf = useCallback(
    (key: SeatKey): Price | null => {
      const seat = seatByKey.get(key);
      return seat ? priceForSeat(pricing, seat) : null;
    },
    [seatByKey, pricing],
  );
  const format = useCallback(
    (price: Price | null) => (price !== null ? options.formatPrice(price) : ''),
    [options],
  );
  // Seats of the selection still to reserve and pay for: a completed purchase is not booked, bought
  // or quoted again. Once everything is bought, the total is what was paid: the prices captured when
  // the viewer confirmed, not the current pricing.
  const due = useMemo(
    () => selected.filter((key) => !purchasedTickets.has(key)),
    [selected, purchasedTickets],
  );
  const total = useMemo(
    () =>
      due.length > 0
        ? sumPrices(due.map((key) => priceOf(key)))
        : sumPrices(
            selected.map((key) =>
              purchasedPrices.has(key) ? (purchasedPrices.get(key) ?? null) : priceOf(key),
            ),
          ),
    [due, selected, priceOf, purchasedPrices],
  );

  const booked = selected.length > 0 && selected.every((key) => isMineSeat(key));

  // ---- mounting and environment ----
  const [rootEl, setRootEl] = useState<HTMLElement | null>(null);
  const [desktop, setDesktop] = useState(false);
  const [rootSize, setRootSize] = useState({ width: 0, height: 0 });
  const [viewEl, setViewEl] = useState<HTMLElement | null>(null);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    setWebgl(canUseWebGL());
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useLayoutEffect(() => {
    if (!rootEl) return undefined;
    const measure = () => {
      const { width, height } = rootEl.getBoundingClientRect();
      setDesktop(width >= 1024);
      setRootSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(rootEl);
    return () => observer.disconnect();
  }, [rootEl]);

  // ---- view request and validity (a seat must be open to the viewer, or their own hold) ----
  const [localView, setLocalView] = useState<ViewState>(props.defaultView ?? { stage: 'map' });
  const viewRequest: ViewState = props.view ?? localView;
  const requestedSeat = viewRequest.stage === 'view' ? viewRequest.seatKey : null;
  const valid =
    requestedSeat !== null &&
    seatSet.has(requestedSeat) &&
    !inert &&
    (isMineSeat(requestedSeat) || effectiveStatus(requestedSeat) === 'available');
  const target: Target = valid ? 'view' : 'map';
  const seatKey: SeatKey | null = valid ? requestedSeat : null;
  // The seat the details and the desktop camera are about: the focused one while it is open to the
  // viewer (a taken or blocked seat is never previewed), else the last selected seat.
  const focusedKey =
    state.focusKey !== null &&
    seatSet.has(state.focusKey) &&
    (selected.includes(state.focusKey) ||
      isMineSeat(state.focusKey) ||
      effectiveStatus(state.focusKey) === 'available')
      ? state.focusKey
      : (selected[selected.length - 1] ?? null);
  const previewKey = !inert ? (seatKey ?? focusedKey) : null;

  const reportInvalid = useEffectEvent(() => props.onInvalidView?.());
  useEffect(() => {
    if (requestedSeat !== null && !inert && !valid) reportInvalid();
  }, [requestedSeat, valid, inert]);

  // ---- transitions ----
  const [stableTransitions, setStableTransitions] = useState(props.transitions);
  if (!sameConfig(stableTransitions, props.transitions)) setStableTransitions(props.transitions);
  const resolved = useMemo(
    () => resolveTransition(stableTransitions, reducedMotion),
    [stableTransitions, reducedMotion],
  );
  const [initialTarget] = useState<Target>(target);
  const desktopTransition = useMemo(() => resolveTransition('none', false), []);
  const orchestrator = useTransitionOrchestrator({
    resolved: desktop ? desktopTransition : resolved,
    initialTarget,
    target: desktop ? 'map' : target,
    seatKey: desktop ? null : seatKey,
    webgl,
    onTransition: props.onTransition,
  });

  // ---- occupancy effects ----
  const appliedOccupancy = useRef<Occupancy | undefined>(undefined);
  const [holdSkewMs, setSkew] = useState(0);
  // Seats `onConfirm` is buying right now. The server may already show them as taken before the
  // answer arrives: they are reconciled with the snapshot once the purchase has its result.
  const confirmingKeys = useRef<ReadonlySet<SeatKey>>(new Set());
  const onOccupancy = useEffectEvent((snapshot: Occupancy) => {
    // Bought seats turn taken on the server; they stay in the viewer's selection, and so do the
    // seats of a purchase that is still running.
    const current = readSelection();
    const kept = (key: SeatKey) => purchasedTickets.has(key) || confirmingKeys.current.has(key);
    const bought = current.filter(kept);
    const found = findLostSeats(
      current.filter((key) => !kept(key)),
      snapshot,
      state.mine,
    );
    dispatch({ type: 'occupancy', occupancy: snapshot, lost: found.lost, cause: found.cause });
    if (found.lost.length > 0)
      selection.set(canonicalKeys([...found.kept, ...bought], layoutOrder));
    if (snapshot.serverNow) setSkew(Date.parse(snapshot.serverNow) - Date.now());
  });
  useEffect(() => {
    // Resuming the retained snapshot after a loading gap is not a new confirmation.
    if (occupancy && appliedOccupancy.current !== occupancy) {
      appliedOccupancy.current = occupancy;
      onOccupancy(occupancy);
    }
  }, [occupancy]);
  // Once a purchase has its result, the seats it protected are checked against the last snapshot:
  // bought seats stay (they are in `purchases` now), the seats of a failed purchase may be lost.
  const [confirmSettled, setConfirmSettled] = useState(0);
  const reconcileAfterConfirm = useEffectEvent(() => {
    const snapshot = appliedOccupancy.current;
    if (!snapshot) return;
    const current = readSelection();
    const bought = current.filter((key) => purchasedTickets.has(key));
    const found = findLostSeats(
      current.filter((key) => !purchasedTickets.has(key)),
      snapshot,
      state.mine,
    );
    if (found.lost.length === 0) return;
    // The snapshot itself was applied already: only the lost seats are reported and removed.
    dispatch({ type: 'lost', lost: found.lost, cause: found.cause });
    selection.set(canonicalKeys([...found.kept, ...bought], layoutOrder));
  });
  useEffect(() => {
    if (confirmSettled > 0) reconcileAfterConfirm();
  }, [confirmSettled]);

  const notifyLost = useEffectEvent((keys: SeatKey[], cause: SeatStatus) =>
    props.onSelectionLost?.(keys, cause),
  );
  const lostEvent = state.lostEvent;
  useEffect(() => {
    if (lostEvent) notifyLost(lostEvent.keys, lostEvent.cause);
  }, [lostEvent]);

  // Hold countdown: from the accepted snapshot once it confirms the hold, else from the booking.
  const ownHoldExpiry = (key: SeatKey): string | null => {
    const hold = (occupancy?.held ?? []).find((item) => item.key === key && item.mine);
    const pending = pendingMine.find((mark) => mark.keys.includes(key));
    return hold?.expiresAt ?? pending?.expiresAt ?? (hold ? state.holdExpiries[key] : null) ?? null;
  };
  const relevantHolds = selected.flatMap((key) => {
    if (purchasedTickets.has(key)) return [];
    const expiry = ownHoldExpiry(key);
    return expiry ? [expiry] : [];
  });
  const holdExpiresAt = relevantHolds.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
  const [holdNowMs, setHoldNowMs] = useState(0);
  useEffect(() => {
    if (!holdExpiresAt) return undefined;
    setHoldNowMs(Date.now());
    const id = setInterval(() => setHoldNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [holdExpiresAt]);

  // ---- purchase step (onConfirm) ----
  const holdExpired =
    holdExpiresAt !== null && Date.parse(holdExpiresAt) <= (holdNowMs || Date.now()) + holdSkewMs;
  const allPurchased = selected.length > 0 && selected.every((key) => purchasedTickets.has(key));
  const purchaseStatus: PurchaseStatus = allPurchased
    ? 'purchased'
    : state.confirm === 'confirming'
      ? 'confirming'
      : booked && (holdExpired || state.message?.kind === 'holdExpired')
        ? 'expired'
        : state.confirm === 'error'
          ? 'error'
          : 'idle';
  // The purchases that cover the selection, in the order they completed: the last one is the
  // purchase that just went through, whatever the layout order of its seats.
  const selectedPurchases = allPurchased
    ? state.purchases.filter((item) => item.keys.some((key) => selected.includes(key)))
    : [];
  const purchase = {
    status: purchaseStatus,
    ticket: selectedPurchases.at(-1)?.ticket ?? null,
    tickets: [
      ...new Set(selectedPurchases.flatMap((item) => (item.ticket !== null ? [item.ticket] : []))),
    ],
  };

  // ---- sheet config ----
  const sheetProp = props.sheet;
  const sheet: ResolvedSheet | null =
    sheetProp === false
      ? null
      : {
          snapPoints: sheetProp?.snapPoints ?? DEFAULT_SNAP_POINTS,
          initialSnap: sheetProp?.initialSnap ?? 'peek',
          skin: sheetProp?.skin ?? 'glass',
          dimScene: sheetProp?.dimScene ?? true,
          dismissible: sheetProp?.dismissible ?? true,
        };

  // ---- actions ----
  // onViewChange is a REQUEST (like onValueChange): it fires on user intent. Uncontrolled pickers
  // apply it at once; controlled pickers transition when the host passes the new `view`.
  const requestView = (next: ViewState) => {
    const current = props.view ?? localView;
    if (sameView(current, next)) return;
    if (props.view === undefined) setLocalView(next);
    props.onViewChange?.(next);
  };
  const commitSelection = (next: readonly SeatKey[]) => {
    const canonical = canonicalKeys(next, layoutOrder);
    if (sameKeys(canonical, readSelection())) return;
    selection.set(canonical);
  };
  const continueSeat = (): SeatKey | null => {
    const keys = readSelection();
    if (desktop && previewKey !== null) return previewKey;
    if (state.focusKey && keys.includes(state.focusKey)) return state.focusKey;
    return keys[keys.length - 1] ?? null;
  };

  const activate = (key: SeatKey) => {
    const current = readSelection();
    const wasSelected = current.includes(key);
    if (inert || !seatSet.has(key)) return;
    const pickable = wasSelected || isOwnHold(key) || effectiveStatus(key) === 'available';
    const max = selectionMode.mode === 'multiple' ? selectionMode.max : undefined;
    const result = toggleSeat(current, key, { mode: selectionMode.mode, max, pickable });
    if (result.maxReached && max !== undefined)
      dispatch({ type: 'message', message: { kind: 'maxSeats', max } });
    commitSelection(result.selected);
    const willSelect = !wasSelected && result.selected.includes(key);
    if (willSelect && selectionMode.openViewOn === 'select') {
      requestView({ stage: 'view', seatKey: key });
    }
  };

  const enterSelection = useEffectEvent((key: SeatKey) => {
    const current = readSelection();
    if (current.includes(key)) return;
    const max = selectionMode.mode === 'multiple' ? selectionMode.max : undefined;
    const result = toggleSeat(current, key, { mode: selectionMode.mode, max, pickable: true });
    if (result.maxReached && max !== undefined)
      dispatch({ type: 'message', message: { kind: 'maxSeats', max } });
    commitSelection(result.selected);
  });
  useEffect(() => {
    if (seatKey !== null) enterSelection(seatKey);
  }, [seatKey]);

  const bookingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const confirmingRef = useRef(false);
  const confirmAbortRef = useRef<AbortController | null>(null);
  // What onBook returned per reserved seat, handed back to onConfirm.
  // The `data` of each reservation this picker made, with the end time of that hold. It belongs to
  // that hold only: once the seat stops being the viewer's own hold, or the hold's time has run out,
  // a later own hold for the seat (made in another tab, say) gets no data of its own.
  const bookingData = useRef(new Map<SeatKey, { data: TData; expiresAt: string | null }>());
  const holdEnded = (entry: { expiresAt: string | null }, now: number) =>
    entry.expiresAt !== null && Date.parse(entry.expiresAt) <= now;
  const liveBookingData = (key: SeatKey, now: number): { data: TData } | undefined => {
    const entry = bookingData.current.get(key);
    if (!entry) return undefined;
    // `now` is the browser's clock: the hold's end is judged on the server's, like the countdown.
    if (!isOwnHold(key) || holdEnded(entry, now + holdSkewMs)) {
      bookingData.current.delete(key);
      return undefined;
    }
    // A hold the server extends while it is still active is the same hold.
    const expiry = ownHoldExpiry(key);
    if (expiry !== null) entry.expiresAt = expiry;
    return entry;
  };
  // Checked on every render (each occupancy snapshot and each countdown tick), so a gap in the hold
  // is noticed even if the seat is the viewer's own again by the time the purchase starts.
  useEffect(() => {
    const now = Date.now();
    for (const key of [...bookingData.current.keys()]) liveBookingData(key, now);
  });
  const mountedRef = useRef(false);
  const onBookedRef = useRef(props.onBooked);
  useLayoutEffect(() => {
    onBookedRef.current = props.onBooked;
  });
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      confirmAbortRef.current?.abort();
    };
  }, []);

  const book = () => {
    // Seats bought earlier stay selected, but the next reservation is only for the others.
    const keys = readSelection().filter((key) => !purchasedTickets.has(key));
    const onBook = props.onBook;
    if (!onBook || occupancy === undefined || keys.length === 0) return;
    if (bookingRef.current || state.status === 'booking' || booked) return;
    // Base rules always run (unknown, unavailable), then the mode's own rules.
    const rules = selectionMode.mode === 'multiple' ? (selectionMode.rules ?? []) : [];
    const validationOccupancy: Occupancy = {
      revision: occupancy.revision,
      taken: [],
      blocked: [],
      held: [],
    };
    for (const seat of layout.seats) {
      const status = effectiveStatus(seat.key);
      if (status === 'taken' || purchasedTickets.has(seat.key))
        validationOccupancy.taken!.push(seat.key);
      else if (status === 'blocked') validationOccupancy.blocked!.push(seat.key);
      else if (status === 'held' && !isMineSeat(seat.key))
        validationOccupancy.held!.push({ key: seat.key });
    }
    const violations = validateSelection(layout, validationOccupancy, keys, rules);
    if (violations.length > 0) {
      dispatch({ type: 'violations', list: violations });
      return;
    }
    // The quote is the whole accepted selection: a seat without a price makes it unquotable.
    if (sumPrices(keys.map((key) => priceOf(key))) === null) return;
    const key = attemptKey(keys);
    const attemptId =
      state.attempt && state.attempt.key === key ? state.attempt.id : newAttemptId();
    bookingRef.current = true;
    dispatch({ type: 'bookStart', attemptKey: key, attemptId });
    const abort = new AbortController();
    abortRef.current = abort;
    void runBook<TData>(onBook, keys, priceRows(keys, priceOf), attemptId, abort.signal).then(
      (result: BookResult<TData>) => {
        bookingRef.current = false;
        if (!mountedRef.current) return;
        dispatch({ type: 'bookResult', result, keys });
        if (result.ok) {
          // One entry for the whole hold: seats sharing it are known to be the same reservation.
          const entry = { data: result.data, expiresAt: result.hold?.expiresAt ?? null };
          for (const key of keys) bookingData.current.set(key, entry);
          onBookedRef.current?.(result);
        } else if (result.reason === 'conflict') {
          const taken = result.keys;
          selection.set(readSelection().filter((item) => !taken.includes(item)));
        }
      },
    );
  };

  const confirm = () => {
    const onConfirm = props.onConfirm;
    // Only the reserved seats that are not bought yet are confirmed.
    const keys = readSelection().filter((key) => !purchasedTickets.has(key));
    if (!onConfirm || keys.length === 0 || confirmingRef.current) return;
    if (!keys.every((key) => isMineSeat(key))) return;
    if (holdExpired) {
      dispatch({ type: 'message', message: { kind: 'holdExpired' } });
      return;
    }
    confirmingRef.current = true;
    confirmingKeys.current = new Set(keys);
    dispatch({ type: 'confirmStart' });
    const abort = new AbortController();
    confirmAbortRef.current = abort;
    const now = Date.now();
    // The data goes along only when one reservation made here covers every seat being confirmed:
    // seats from separate holds, or held outside this picker, get none rather than another's.
    const entries = keys.map((key) => liveBookingData(key, now));
    const booking = entries.every((entry) => entry !== undefined && entry === entries[0])
      ? entries[0]?.data
      : undefined;
    // The prices the viewer confirms: the purchase keeps them whatever the pricing does next.
    const prices = Object.fromEntries(keys.map((key) => [key, priceOf(key)] as const));
    void runConfirm<TData>(onConfirm, keys, {
      booking,
      holdExpiresAt,
      signal: abort.signal,
    }).then((result) => {
      confirmingRef.current = false;
      confirmingKeys.current = new Set();
      if (!mountedRef.current) return;
      dispatch({ type: 'confirmResult', result, keys, prices });
      setConfirmSettled((count) => count + 1);
    });
  };

  const seatViewRef = useRef<SeatViewHandle | null>(null);
  const actions: PickerActions = {
    activate,
    select: (key) => {
      if (!readSelection().includes(key)) activate(key);
    },
    deselect: (key) => {
      commitSelection(readSelection().filter((item) => item !== key));
    },
    focus: (key) => dispatch({ type: 'focus', key }),
    continueToView: () => {
      const seat = continueSeat();
      if (seat !== null) requestView({ stage: 'view', seatKey: seat });
    },
    openView: (key) => {
      const seat = key ?? continueSeat();
      if (seat !== null) requestView({ stage: 'view', seatKey: seat });
    },
    backToMap: () => requestView({ stage: 'map' }),
    book: () => book(),
    confirm: () => confirm(),
    resetLook: () => seatViewRef.current?.resetLook(),
  };

  return {
    layout,
    options,
    state,
    dispatch,
    occupancy,
    inert,
    selectionMode,
    selected,
    booked,
    isMine: isMineSeat,
    isOwnHold,
    confirmable: props.onConfirm !== undefined,
    purchase,
    target,
    seatKey,
    cameraKey: desktop ? previewKey : orchestrator.cameraKey,
    controller: orchestrator.controller,
    resolved,
    flight: desktop
      ? resolved.flight
        ? { ...resolved.flight, lowResScale: 1 }
        : false
      : orchestrator.flight,
    transition: orchestrator.transition,
    phases: orchestrator.phases,
    viewMounted: desktop || orchestrator.viewMounted,
    sheetOpen: orchestrator.sheetOpen,
    sheetInstant: orchestrator.sheetInstant,
    sheetTween: orchestrator.sheetTween,
    onFlight: orchestrator.onFlight,
    onViewReady: orchestrator.onReady,
    sheet,
    rootEl,
    setRootEl,
    viewEl,
    setViewEl,
    webgl,
    pricing,
    avatars: props.avatars,
    screen: props.screen,
    scene: props.scene,
    seatByKey,
    effectiveStatus,
    priceOf,
    format,
    total,
    holdExpiresAt,
    holdNowMs,
    holdSkewMs,
    seatViewRef,
    layoutMode: props.layoutMode ?? 'contained',
    desktop,
    narrow: rootSize.width > 0 && rootSize.width < NARROW_ROOT_PX,
    rootHeight: rootSize.height,
    previewKey,
    actions,
  };
}

function sameView(a: ViewState, b: ViewState): boolean {
  if (a.stage !== b.stage) return false;
  return a.stage === 'map' || (b.stage === 'view' && a.seatKey === b.seatKey);
}
