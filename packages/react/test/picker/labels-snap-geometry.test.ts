import { describe, expect, it } from 'vitest';
import { formatLabel, labels } from '../../src/labels/labels.js';
import { fitPeek, resolveSnapPoints, validateSnapOrder } from '../../src/sheet/snap.js';
import { buildMapGeometry } from '../../src/seat-map/geometry.js';
import type { HallLayout } from '@cinema-hall/core';

describe('peek snap', () => {
  it('peek is measured pixels, not a fraction of the sheet (F20)', () => {
    expect(resolveSnapPoints([0, 'peek', 1], 180)).toEqual([0, 180, 1]);
    expect(resolveSnapPoints([0, 'peek', 1], 0)).toEqual([0, 160, 1]);
  });
});

describe('metric labels', () => {
  it('formats metres and degrees with the locale labels (F27)', () => {
    expect(formatLabel(labels.en.picker.metres, { value: '12.4' })).toBe('12.4 m');
    expect(formatLabel(labels.en.picker.metres, { value: '12,4' })).toBe('12,4 m');
    expect(formatLabel(labels.en.picker.degrees, { value: 100 })).toBe('100°');
    expect(formatLabel(labels.en.picker.booked)).toBe('Seats reserved');
  });
});

describe('screen arc (F36)', () => {
  const layout = {
    screen: { width: 8, height: 4, elevation: 1, curvature: 0, center: { x: 0, y: 4, z: 0 } },
    seatTypes: { std: { label: 'Standard', width: 0.5, depth: 0.55, color: '#66ad72' } },
    seats: [
      {
        key: 'a',
        position: { x: -1, y: 0, z: 3 },
        seatTypeId: 'std',
        rowIndex: 0,
        priceTier: 'std',
      },
      {
        key: 'b',
        position: { x: 1, y: 0, z: 3 },
        seatTypeId: 'std',
        rowIndex: 0,
        priceTier: 'std',
      },
    ],
    rows: [{ index: 0, label: 'A', bandId: 'band', elevation: 0, seatKeys: ['a', 'b'] }],
  } as unknown as HallLayout;

  it('a flat screen still gets a curved arc over the seat block, with the label below it', () => {
    const geometry = buildMapGeometry(layout);
    expect(geometry.screen.sagitta).toBeGreaterThan(0);
    expect(geometry.screen.path).toContain('Q');
    expect(geometry.screen.labelY).toBeGreaterThan(geometry.screen.top + geometry.screen.sagitta);
  });
});

describe('pixel snap points (F38)', () => {
  it('preserves pixel stops and validates finite range and ordering in mixed units', () => {
    expect(resolveSnapPoints([0, 200, 1], 180)).toEqual([0, 200, 1]);
    expect(() => resolveSnapPoints([0, -1, 1], 180)).toThrow(RangeError);
    expect(() => resolveSnapPoints([0, NaN, 1], 180)).toThrow(RangeError);
    expect(() => resolveSnapPoints([0, Infinity, 1], 180)).toThrow(RangeError);
    expect(() => resolveSnapPoints([0, 280, 200, 1], 180)).toThrow(RangeError);
    expect(() => resolveSnapPoints([0, 0.8, 0.5, 1], 180)).toThrow(RangeError);
    expect(() => validateSnapOrder([0, 200, 0.5, 1], 600)).not.toThrow();
    expect(() => validateSnapOrder([0, 0.5, 200, 1], 600)).toThrow(RangeError);
  });
});

describe('fitPeek (F51)', () => {
  it('bounds the peek strictly below the sheet and below the next snap', () => {
    expect(fitPeek(150, 116)).toBe(115);
    expect(fitPeek(100, 400)).toBe(100);
    expect(fitPeek(300, 400, 0.5)).toBe(199);
    expect(fitPeek(300, 400, 240)).toBe(239);
    expect(fitPeek(300, 3)).toBe(2);
  });
});
