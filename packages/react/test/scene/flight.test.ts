import { describe, expect, it } from 'vitest';
import { flightProgress, planFlight, sampleFlight } from '../../src/scene/flight.js';
import type { CameraPose } from '../../src/scene/types.js';
import { fixtureLayout } from './fixtures.js';

const from: CameraPose = { position: { x: 0, y: 1, z: 10 }, target: { x: 0, y: 2, z: 0 } };
const to: CameraPose = { position: { x: 2, y: 1.15, z: 6 }, target: { x: 0, y: 3, z: 0 } };

function request(overrides: Partial<Parameters<typeof planFlight>[3]> = {}) {
  return {
    layout: fixtureLayout,
    direction: 'to-seat' as const,
    duration: 1000,
    ease: 'linear' as const,
    arcHeight: 1,
    ...overrides,
  };
}

describe('camera flight', () => {
  it('starts at the start pose and ends at the target pose', () => {
    const plan = planFlight(from, to, 100, request());
    expect(sampleFlight(plan, 100).pose).toEqual(from);
    const end = sampleFlight(plan, 1100);
    expect(end.done).toBe(true);
    expect(end.pose).toEqual(to);
  });

  it('lifts the camera by the arc height in the middle of the flight', () => {
    const plan = planFlight(from, to, 0, request());
    const middle = sampleFlight(plan, 500);
    expect(middle.progress).toBeCloseTo(0.5, 9);
    expect(middle.done).toBe(false);
    expect(middle.pose.position.y).toBeCloseTo((from.position.y + to.position.y) / 2 + 1, 6);
  });

  it('continues from the current pose when interrupted', () => {
    const first = planFlight(from, to, 0, request());
    const now = 400;
    const current = sampleFlight(first, now).pose;
    const elsewhere: CameraPose = {
      position: { x: -1, y: 1.15, z: 4 },
      target: { x: 0, y: 3, z: 0 },
    };
    const second = planFlight(current, elsewhere, now, request());
    expect(sampleFlight(second, now).pose.position).toEqual(current.position);
    expect(sampleFlight(second, now + 1000).pose).toEqual(elsewhere);
  });

  it('is finished at once when the duration is zero', () => {
    const plan = planFlight(from, to, 0, request({ duration: 0 }));
    expect(flightProgress(plan, 0)).toBe(1);
    expect(sampleFlight(plan, 0).pose).toEqual(to);
  });

  it('hands the eased progress to a custom path', () => {
    const seen: number[] = [];
    const path = (t: number) => {
      seen.push(t);
      return from;
    };
    const plan = planFlight(from, to, 0, request({ path, ease: 'easeIn' }));
    sampleFlight(plan, 500);
    expect(seen[0]).toBeCloseTo(0.125, 9);
  });

  it('clamps progress before the start and after the end', () => {
    const plan = planFlight(from, to, 100, request());
    expect(flightProgress(plan, 0)).toBe(0);
    expect(flightProgress(plan, 5000)).toBe(1);
  });
});
