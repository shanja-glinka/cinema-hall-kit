import { createContext, useContext } from 'react';
import { computeViewForSeat, type Price, type SeatKey } from '@cinema-hall/core';
import type { PickerModel } from './use-picker-model.js';
import type { SeatPickerState } from './types.js';

/** Carries the picker model from `SeatPickerRoot` to its parts. */
export const PickerContext = createContext<PickerModel | null>(null);

/**
 * The picker model for a part. Throws a clear error outside `SeatPickerRoot`.
 * @param consumer - Name of the calling part, for the error message.
 * @returns The model.
 * @example
 * ```tsx
 * const model = useRequiredModel("SeatPickerFooter");
 * ```
 */
export function useRequiredModel(consumer: string): PickerModel {
  const model = useContext(PickerContext);
  if (!model)
    throw new Error(`${consumer} must be rendered inside <SeatPickerRoot> (or <SeatPicker>).`);
  return model;
}

/**
 * Headless access to the picker. Narrowed by stage: on the `view` stage the seat, metrics and
 * price are never null. Usable only inside `SeatPickerRoot`.
 * @returns The picker state and its actions.
 * @example
 * ```tsx
 * const picker = useSeatPicker();
 * if (picker.stage === "view") return <b>{picker.format(picker.price)}</b>;
 * ```
 */
export function useSeatPicker(): SeatPickerState {
  const model = useContext(PickerContext);
  if (!model)
    throw new Error('useSeatPicker() must be used inside <SeatPickerRoot> (or <SeatPicker>).');
  const common = {
    selected: model.selected,
    total: model.total,
    violations: model.state.violations,
    status: model.state.status,
    holdExpiresAt: model.holdExpiresAt,
    purchase: model.purchase,
    confirm: () => model.actions.confirm(),
    format: (price: Price | null) => model.format(price),
    select: (key: SeatKey) => model.actions.select(key),
    deselect: (key: SeatKey) => model.actions.deselect(key),
    book: () => model.actions.book(),
    backToMap: () => model.actions.backToMap(),
    openView: (key?: SeatKey) => model.actions.openView(key),
    resetLook: () => model.actions.resetLook(),
    transition: {
      phase: model.transition.phase,
      direction: model.transition.direction,
      progress: model.controller.progress,
      phases: model.phases,
    },
    layout: model.layout,
  };
  if (model.target === 'view' && model.seatKey !== null) {
    const seat = model.seatByKey.get(model.seatKey);
    if (seat) {
      return {
        ...common,
        stage: 'view',
        seat,
        metrics: computeViewForSeat(model.layout, seat),
        price: model.priceOf(seat.key),
      };
    }
  }
  return { ...common, stage: 'map', seat: null, metrics: null, price: null };
}
