import type { HallLayout, Seat, SeatKey } from '@cinema-hall/core';

const LETTERS = 'ABCDEFGHIJ';

/** A small hall: `rows` rows of `perRow` standard seats, keys `main.r{row}.s{seat}`. */
export function makeLayout(rows: number, perRow: number): HallLayout {
  const seats: Seat[] = [];
  const rowMarks: {
    index: number;
    label: string;
    bandId: string;
    elevation: number;
    seatKeys: SeatKey[];
  }[] = [];
  for (let r = 0; r < rows; r++) {
    const letter = LETTERS[r] ?? 'Z';
    const keys: SeatKey[] = [];
    for (let c = 0; c < perRow; c++) {
      const key = `main.r${r + 1}.s${c + 1}`;
      keys.push(key);
      const x = (c - (perRow - 1) / 2) * 0.6;
      const z = 3 + r * 0.95;
      seats.push({
        key,
        label: `${letter}${c + 1}`,
        row: letter,
        number: c + 1,
        rowIndex: r,
        col: c,
        bandId: 'band',
        sectionId: 'main',
        sectionRow: r + 1,
        sectionSeat: c + 1,
        seatTypeId: 'std',
        priceTier: 'std',
        color: '#66ad72',
        position: { x, y: 0, z },
        eye: { x, y: 1.15, z },
      });
    }
    rowMarks.push({ index: r, label: letter, bandId: 'band', elevation: 0, seatKeys: keys });
  }
  return {
    schemaVersion: 1,
    name: 'test',
    hall: { width: 10, depth: 12, height: 5 },
    screen: { width: 8, height: 4, elevation: 1, curvature: 0, center: { x: 0, y: 4, z: 0 } },
    seatTypes: { std: { label: 'Standard', width: 0.5, depth: 0.55, color: '#66ad72' } },
    zones: [{ id: 'standard', label: 'Standard view', minFov: 0 }],
    eyeHeight: 1.15,
    seats,
    rows: rowMarks,
    sections: [],
    bounds: { min: { x: -5, y: 0, z: 0 }, max: { x: 5, y: 5, z: 12 } },
  } as unknown as HallLayout;
}
