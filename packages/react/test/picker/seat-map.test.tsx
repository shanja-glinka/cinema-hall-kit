import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HallLayout, Seat, SeatKey } from '@cinema-hall/core';
import { SeatMap } from '../../src/seat-map/SeatMap.js';
import { labels } from '../../src/labels/labels.js';

const LETTERS = 'ABCDEFGHIJ';

/** A 2 × 3 hall, enough for keyboard and aria checks. */
function makeLayout(rows: number, perRow: number): HallLayout {
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
        level: 0,
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
    zones: [],
    eyeHeight: 1.15,
    seats,
    rows: rowMarks,
    sections: [],
    bounds: { min: { x: -5, y: 0, z: 0 }, max: { x: 5, y: 5, z: 12 } },
  } as unknown as HallLayout;
}

const layout = makeLayout(2, 3);
const picker = labels.en.picker;

afterEach(() => cleanup());

function renderMap(overrides: Partial<Parameters<typeof SeatMap>[0]> = {}) {
  const props = {
    layout,
    status: (key: SeatKey) => (key === 'main.r1.s3' ? 'taken' : 'available'),
    selected: [] as SeatKey[],
    focusKey: 'main.r1.s1',
    labels: picker,
    onFocusSeat: vi.fn(),
    onActivate: vi.fn(),
    ...overrides,
  } as Parameters<typeof SeatMap>[0];
  const view = render(<SeatMap {...props} />);
  return { ...view, props };
}

describe('SeatMap', () => {
  it('renders a grid with one gridcell per seat and a roving tab stop', () => {
    renderMap();
    const grid = screen.getByRole('grid', { name: picker.mapAria as string });
    const cells = within(grid).getAllByRole('gridcell');
    expect(cells).toHaveLength(6);
    expect(cells.filter((cell) => cell.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(cells[0]?.getAttribute('tabindex')).toBe('0');
  });

  it('describes a seat for screen readers and marks unavailable seats', () => {
    renderMap();
    const taken = screen.getByRole('gridcell', { name: /A3, Standard, , Taken/ });
    expect(taken.getAttribute('aria-disabled')).toBe('true');
    const free = screen.getByRole('gridcell', { name: /A1, Standard, , Available/ });
    expect(free.getAttribute('aria-disabled')).toBeNull();
  });

  it('moves focus with the arrow keys to the nearest seat in that direction', () => {
    const { props } = renderMap();
    const grid = screen.getByRole('grid');
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    expect(props.onFocusSeat).toHaveBeenLastCalledWith('main.r1.s2');
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(props.onFocusSeat).toHaveBeenLastCalledWith('main.r2.s1');
  });

  it('Home and End go to the ends of the row', () => {
    const { props } = renderMap({ focusKey: 'main.r1.s2' });
    const grid = screen.getByRole('grid');
    fireEvent.keyDown(grid, { key: 'End' });
    expect(props.onFocusSeat).toHaveBeenLastCalledWith('main.r1.s3');
    fireEvent.keyDown(grid, { key: 'Home' });
    expect(props.onFocusSeat).toHaveBeenLastCalledWith('main.r1.s1');
  });

  it('Enter picks the focused seat when it is available, and not a taken one', () => {
    const { props } = renderMap({ focusKey: 'main.r1.s1' });
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'Enter' });
    expect(props.onActivate).toHaveBeenLastCalledWith('main.r1.s1');

    const second = renderMap({ focusKey: 'main.r1.s3' });
    fireEvent.keyDown(second.container.querySelector('[role="grid"]') as Element, { key: ' ' });
    expect(second.props.onActivate).not.toHaveBeenCalled();
  });

  it('inert occupancy makes every seat unavailable', () => {
    renderMap({ inert: true });
    const free = screen.getByRole('gridcell', { name: /A1/ });
    expect(free.getAttribute('aria-disabled')).toBe('true');
  });
});
