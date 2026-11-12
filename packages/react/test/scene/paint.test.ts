import { describe, expect, it } from 'vitest';
import { Color } from 'three';
import {
  BLOCKED_FACTOR,
  seatColor,
  seatTypeColors,
  type SeatPaint,
} from '../../src/scene/paint.js';
import { fixtureLayout } from './fixtures.js';

const seat = fixtureLayout.seats[0]!;
const basePaint: SeatPaint = {
  accent: '#66ad72',
  danger: '#ff6b6b',
  selected: new Set(),
  dangerSections: new Set(),
  blocked: new Set(),
  themeSeatColors: {},
};

describe('seat colour', () => {
  it('uses the seat colour by default', () => {
    expect(seatColor(seat, basePaint).getHexString()).toBe(new Color(seat.color).getHexString());
  });

  it('gives selected seats the accent colour', () => {
    const paint = { ...basePaint, selected: new Set([seat.key]) };
    expect(seatColor(seat, paint).getHexString()).toBe('66ad72');
  });

  it('gives a seat in a highlighted section the danger colour, unless it is selected', () => {
    const inSection = { ...basePaint, dangerSections: new Set([seat.sectionId]) };
    expect(seatColor(seat, inSection).getHexString()).toBe('ff6b6b');
    const both = { ...inSection, selected: new Set([seat.key]) };
    expect(seatColor(seat, both).getHexString()).toBe('66ad72');
  });

  it('lets the theme colour replace the seat colour', () => {
    const paint = { ...basePaint, themeSeatColors: { [seat.seatTypeId]: '#00ff00' } };
    expect(seatColor(seat, paint).getHexString()).toBe('00ff00');
  });

  it('darkens blocked seats', () => {
    const base = seatColor(seat, basePaint);
    const blocked = seatColor(seat, { ...basePaint, blocked: new Set([seat.key]) });
    expect(blocked.r).toBeCloseTo(base.r * BLOCKED_FACTOR, 6);
    expect(blocked.g).toBeCloseTo(base.g * BLOCKED_FACTOR, 6);
  });
});

describe('seatTypeColors', () => {
  it('keeps only the scene colours of the theme', () => {
    const colors = seatTypeColors({
      seatTypes: { standard: { scene: '#111111' }, recliner: { fill: '#222222' } },
    });
    expect(colors).toEqual({ standard: '#111111' });
  });
});
