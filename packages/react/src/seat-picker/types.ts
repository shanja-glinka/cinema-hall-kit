import type { CSSProperties, ReactNode } from 'react';
import type {
  Avatars,
  BookContext,
  BookResult,
  HallConfig,
  HallLayout,
  Price,
  Occupancy,
  Pricing,
  ScreenContent,
  Seat,
  SeatKey,
  SelectionRule,
  SelectionViolation,
  SeatStatus,
} from '@cinema-hall/core';
import type { CinemaHallOptions } from '../provider/provider.js';
import type { SceneOptions } from '../scene/types.js';
import type { SheetSkin } from '../sheet/GlassSheet.js';
import type { SnapValue } from '../sheet/snap.js';
import type { PhaseName, Direction } from '../transitions/timeline.js';
import type { TransitionProgress } from '../transitions/controller.js';
import type { TransitionsProp } from '../transitions/presets.js';
import type { SeatViewMetrics } from '@cinema-hall/core';

/** When the 3D view opens in multiple mode: on Preview (the default flow) or at once on tap. */
export type OpenViewOn = 'continue' | 'select';

/** How seats are picked: one seat, or several with an optional `max` and rules. */
export type SelectionMode =
  | { mode: 'single'; openViewOn?: OpenViewOn }
  | { mode: 'multiple'; max?: number; rules?: SelectionRule[]; openViewOn?: OpenViewOn };

/** Which stage the picker shows: the map, or the 3D view from a seat. */
export type ViewState = { stage: 'map' } | { stage: 'view'; seatKey: SeatKey };

/** Where the booking flow is: idle, in flight, refused by a conflict, or failed. */
export type BookingStatus = 'idle' | 'booking' | 'conflict' | 'error';

/** Options of the glass bottom sheet. */
export interface SheetOptions {
  /** Default `[0, 'peek', 1]`. */
  snapPoints?: SnapValue[];
  /** Default `'peek'`. */
  initialSnap?: SnapValue;
  /** Default `glass`. */
  skin?: SheetSkin;
  /** Default `true`: the scene darkens and blurs slightly as the sheet rises. */
  dimScene?: boolean;
  /** Default `true`. */
  dismissible?: boolean;
}

/** A transition phase boundary reported through `onTransition`. */
export interface TransitionEventInfo {
  phase: PhaseName;
  direction: Direction;
  state: 'start' | 'end';
}

/** Props of `SeatPickerRoot` and `SeatPicker`. Prices are plain numbers; pass `formatPrice` to change how they read. */
export interface SeatPickerRootProps<TData = unknown> extends CinemaHallOptions {
  config?: HallConfig;
  /** Use instead of `config` when the layout is already built. */
  layout?: HallLayout;
  occupancy?: Occupancy;
  pricing?: Pricing;
  avatars?: Avatars;
  screen?: ScreenContent;

  selection?: SelectionMode;
  value?: SeatKey[];
  defaultValue?: SeatKey[];
  onValueChange?: (keys: SeatKey[]) => void;
  onSelectionLost?: (keys: SeatKey[], cause: SeatStatus) => void;

  view?: ViewState;
  defaultView?: ViewState;
  /** Requests a view on user intent; controlled transitions await the host value. */
  onViewChange?: (view: ViewState) => void;
  onInvalidView?: () => void;

  onBook?: (keys: SeatKey[], ctx: BookContext) => Promise<BookResult<TData>>;
  /** Receives the ok result with the data the host returned from `onBook`. */
  onBooked?: (result: Extract<BookResult<TData>, { ok: true }>) => void;

  transitions?: TransitionsProp;
  onTransition?: (event: TransitionEventInfo) => void;

  /** `false` renders no sheet. */
  sheet?: false | SheetOptions;
  scene?: SceneOptions;
  layoutMode?: 'contained' | 'fullscreen';

  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

interface PickerCommon {
  selected: SeatKey[];
  /** Sum of the selected prices, or `null` when a price is missing. */
  total: Price | null;
  violations: SelectionViolation[];
  status: BookingStatus;
  /** Seconds left on the hold, when the server gave one. */
  holdExpiresAt: string | null;
  format(price: Price | null): string;
  select(key: SeatKey): void;
  deselect(key: SeatKey): void;
  book(): void;
  backToMap(): void;
  openView(key?: SeatKey): void;
  resetLook(): void;
  transition: {
    phase: PhaseName | null;
    direction: Direction | null;
    progress: TransitionProgress;
    phases: Record<PhaseName, TransitionProgress>;
  };
  layout: HallLayout;
}

/** What `useSeatPicker()` returns, narrowed by `stage`: on `view` the seat, metrics and price are present. */
export type SeatPickerState =
  | (PickerCommon & { stage: 'map'; seat: null; metrics: null; price: null })
  | (PickerCommon & { stage: 'view'; seat: Seat; metrics: SeatViewMetrics; price: Price | null });
