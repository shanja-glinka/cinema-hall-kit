import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildHallLayout, templates, type HallLayout, type SeatKey } from '@cinema-hall/core';
import { SeatMap } from '../../src/seat-map/SeatMap.js';
import { buildMapGeometry, nearestSeat } from '../../src/seat-map/geometry.js';
import { labels } from '../../src/labels/labels.js';

const picker = labels.en.picker;
const layout = buildHallLayout(templates.balcony());

afterEach(() => cleanup());

function renderMap(map: HallLayout, focusKey: SeatKey) {
  const props = {
    layout: map,
    status: () => 'available' as const,
    selected: [] as SeatKey[],
    focusKey,
    labels: picker,
    onFocusSeat: vi.fn(),
    onActivate: vi.fn(),
  };
  render(<SeatMap {...props} />);
  return props;
}

/** The balcony template without names on its bands. */
function unnamed(): HallLayout {
  const config = templates.balcony();
  return buildHallLayout({
    ...config,
    layout: {
      ...config.layout,
      bands: config.layout.bands.map(({ label: _label, ...band }) => band),
    },
  });
}

describe('seat map geometry of a hall with a balcony', () => {
  it('stacks the balcony below the ground floor instead of over it', () => {
    const geometry = buildMapGeometry(layout);
    expect(geometry.levels.map((level) => level.level)).toEqual([0, 1]);
    const [ground, upper] = geometry.levels;
    expect(ground!.headingY).toBeNull();
    expect(upper!.headingY).not.toBeNull();
    expect(upper!.top).toBeGreaterThan(ground!.bottom);
    expect(upper!.headingY!).toBeGreaterThan(ground!.bottom);
    expect(upper!.headingY!).toBeLessThan(upper!.top);
    expect(upper!.bandLabels).toEqual(['Balcony']);
    for (const cell of geometry.seats) {
      if (cell.level === 1) expect(cell.cy).toBeGreaterThanOrEqual(upper!.top);
      else expect(cell.cy).toBeLessThanOrEqual(ground!.bottom);
    }
    // The screen stays above the ground floor, and the view box holds every block.
    expect(geometry.screen.top).toBeLessThan(ground!.top);
    expect(geometry.viewBox.y + geometry.viewBox.height).toBeGreaterThan(upper!.bottom);
  });

  it('keeps a one-level hall as it was', () => {
    const flat = buildHallLayout(templates.threeSections());
    const geometry = buildMapGeometry(flat);
    expect(geometry.levels).toHaveLength(1);
    const seat = flat.seats[0]!;
    expect(geometry.byKey.get(seat.key)!.cy).toBeCloseTo(seat.position.z * 100, 6);
  });

  it('moves left and right within a level and up and down between levels', () => {
    const geometry = buildMapGeometry(layout);
    const balconyFirst = layout.seats.find((seat) => seat.bandId === 'balcony')!;
    expect(nearestSeat(geometry, balconyFirst.key, 'left')).toBeNull();
    const up = nearestSeat(geometry, balconyFirst.key, 'up')!;
    expect(geometry.byKey.get(up)!.level).toBe(0);
    const lastGround = [...layout.seats].reverse().find((seat) => seat.level === 0)!;
    const down = nearestSeat(geometry, lastGround.key, 'down')!;
    expect(geometry.byKey.get(down)!.level).toBe(1);
  });
});

describe('seat map of a hall with a balcony', () => {
  it('has one grid per level, the balcony under its heading', () => {
    const first = layout.seats[0]!.key;
    renderMap(layout, first);
    const map = screen.getByRole('group', { name: picker.mapAria as string });
    const grids = within(map).getAllByRole('grid');
    expect(grids.map((grid) => grid.getAttribute('aria-label'))).toEqual([
      'Seat map: Stalls · Recliners',
      'Seat map: Balcony',
    ]);
    const balconySeats = layout.seats.filter((seat) => seat.level === 1).length;
    expect(within(grids[1]!).getAllByRole('gridcell')).toHaveLength(balconySeats);
    expect(grids[1]!.getAttribute('aria-rowcount')).toBe('3');
    // Rows count from 1 within their grid.
    expect(within(grids[1]!).getAllByRole('row')[0]!.getAttribute('aria-rowindex')).toBe('1');
    const heading = document.querySelector('[data-chk="map-level-heading"]');
    expect(heading?.textContent).toBe('Balcony');
    // The ground floor has the screen, and no heading.
    expect(grids[0]!.querySelector('[data-chk="map-level-heading"]')).toBeNull();
    expect(document.querySelectorAll('[data-chk="screen"]')).toHaveLength(1);
    // One roving tab stop for the whole map.
    expect(document.querySelectorAll('[data-chk="seat"][tabindex="0"]')).toHaveLength(1);
  });

  it('moves the keyboard focus from the ground floor to the balcony', () => {
    const lastGround = [...layout.seats].reverse().find((seat) => seat.level === 0)!;
    const props = renderMap(layout, lastGround.key);
    fireEvent.keyDown(screen.getByRole('group', { name: picker.mapAria as string }), {
      key: 'ArrowDown',
    });
    const next = props.onFocusSeat.mock.calls.at(-1)?.[0] as SeatKey;
    expect(layout.seats.find((seat) => seat.key === next)?.level).toBe(1);
  });

  it('names unnamed levels "Ground floor" and "Balcony"', () => {
    const map = unnamed();
    renderMap(map, map.seats[0]!.key);
    expect(screen.getAllByRole('grid').map((grid) => grid.getAttribute('aria-label'))).toEqual([
      'Seat map: Ground floor',
      'Seat map: Balcony',
    ]);
  });

  it('keeps one grid for a hall on one level', () => {
    const flat = buildHallLayout(templates.threeSections());
    renderMap(flat, flat.seats[0]!.key);
    expect(screen.getByRole('grid', { name: picker.mapAria as string })).toBeDefined();
    expect(document.querySelector('[data-chk="map-level"]')).toBeNull();
  });
});
