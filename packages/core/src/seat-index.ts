import { makeSeatKey, type HallLayout, type Seat, type SeatKey } from './layout.js';

/** Lookup helpers over the seats of one layout, built with `createSeatIndex`. */
export interface SeatIndex {
  get(key: SeatKey): Seat | undefined;
  has(key: SeatKey): boolean;
  /**
   * Physically adjacent seats in the same section row (an aisle or excluded seat breaks adjacency).
   */
  neighbors(key: SeatKey): { left?: Seat; right?: Seat };
  /** Seats of a global row, left to right. */
  row(rowIndex: number): Seat[];
}

/** Lookup structure for a layout. Kept out of `HallLayout` so the layout stays plain data. */
export function createSeatIndex(layout: HallLayout): SeatIndex {
  const byKey = new Map<SeatKey, Seat>();
  const byRow = new Map<number, Seat[]>();
  for (const seat of layout.seats) {
    byKey.set(seat.key, seat);
    const list = byRow.get(seat.rowIndex);
    if (list) list.push(seat);
    else byRow.set(seat.rowIndex, [seat]);
  }
  const sibling = (seat: Seat, delta: number) =>
    byKey.get(makeSeatKey(seat.sectionId, seat.sectionRow, seat.sectionSeat + delta));

  return {
    get: (key) => byKey.get(key),
    has: (key) => byKey.has(key),
    neighbors(key) {
      const seat = byKey.get(key);
      if (!seat) return {};
      const left = sibling(seat, -1);
      const right = sibling(seat, 1);
      return { ...(left ? { left } : {}), ...(right ? { right } : {}) };
    },
    row: (rowIndex) => byRow.get(rowIndex) ?? [],
  };
}
