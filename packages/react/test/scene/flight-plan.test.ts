import { describe, expect, it } from 'vitest';
import {
  flightProgress,
  planFlight,
  sampleFlight,
  type FlightPlan,
} from '../../src/scene/flight.js';
import { flightDpr } from '../../src/scene/math.js';
import type { CameraPose } from '../../src/scene/types.js';
import { fixtureLayout } from './fixtures.js';

const from: CameraPose = { position: { x: 0, y: 1.2, z: 8 }, target: { x: 0, y: 1.2, z: 0 } };
const to: CameraPose = { position: { x: 0, y: 1.15, z: -4 }, target: { x: 0, y: 1.15, z: -10 } };

function plan(duration: number, arcHeight?: number): FlightPlan {
  return planFlight(from, to, 1000, {
    layout: fixtureLayout,
    direction: 'to-seat',
    duration,
    arcHeight,
  });
}

describe('flight plan inputs', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -400])(
    'treats the duration %s as an instant flight',
    (duration) => {
      const sample = sampleFlight(plan(duration), 1000);
      expect(sample.done).toBe(true);
      expect(sample.progress).toBe(1);
      expect(sample.pose.position).toEqual(to.position);
    },
  );

  it('finishes a flight whose clock gives no finite time', () => {
    expect(sampleFlight(plan(1200), Number.NaN).done).toBe(true);
    expect(flightProgress(plan(1200), Number.NaN)).toBe(1);
  });

  it('keeps a finite duration running', () => {
    const sample = sampleFlight(plan(1000), 1500);
    expect(sample.done).toBe(false);
    expect(sample.progress).toBeCloseTo(0.5, 9);
  });

  it('falls back to the default arc for a non-finite arc height', () => {
    expect(sampleFlight(plan(1200, Number.NaN), 1600).pose).toEqual(
      sampleFlight(plan(1200), 1600).pose,
    );
  });

  it('replaces a pose that is not finite with the other pose', () => {
    const broken: CameraPose = { ...from, position: { x: Number.NaN, y: 1.2, z: 8 } };
    const sample = sampleFlight(
      planFlight(broken, to, 1000, { layout: fixtureLayout, direction: 'to-seat', duration: 1200 }),
      1000,
    );
    expect(sample.pose.position).toEqual(to.position);
  });
});

describe('lowered device pixel ratio during a flight', () => {
  it('scales the ratio and keeps it within [1, maxDpr]', () => {
    expect(flightDpr(2, 0.6, 2)).toBeCloseTo(1.2, 9);
  });

  it('lowers nothing on a 1× screen', () => {
    expect(flightDpr(1, 0.6, 2)).toBe(1);
  });

  it('never goes below 1', () => {
    expect(flightDpr(2, 0.3, 2)).toBe(1);
  });

  it('never goes above maxDpr', () => {
    expect(flightDpr(3, 1, 2)).toBe(2);
  });

  it('gives 1 for a base that is not a number', () => {
    expect(flightDpr(Number.NaN, 0.6, 2)).toBe(1);
  });
});
