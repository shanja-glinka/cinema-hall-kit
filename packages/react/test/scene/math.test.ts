import { describe, expect, it } from 'vitest';
import type { CameraPose } from '../../src/scene/types.js';
import {
  applyLook,
  AVATAR_PALETTE,
  ceilingLightSpots,
  clampAngle,
  coverFit,
  curvedScreenZ,
  decalPlacement,
  hallAnchors,
  HEAD_JITTER,
  headOffset,
  hashSeed,
  lookAngles,
  overviewPose,
  paletteColor,
  poseForSeat,
  restoredDpr,
} from '../../src/scene/math.js';
import { fixtureLayout } from './fixtures.js';

describe('avatar head height and colour', () => {
  it('is deterministic for the same seed', () => {
    expect(headOffset('centre.r2.s1')).toBe(headOffset('centre.r2.s1'));
    expect(hashSeed('centre.r2.s1')).toBe(hashSeed('centre.r2.s1'));
  });

  it('keeps every head within the jitter', () => {
    for (let i = 0; i < 500; i++) {
      expect(Math.abs(headOffset(`seat-${i}`))).toBeLessThanOrEqual(HEAD_JITTER);
    }
  });

  it('spreads the heights (different seeds give different heights)', () => {
    const values = new Set(Array.from({ length: 50 }, (_, i) => headOffset(`s${i}`).toFixed(4)));
    expect(values.size).toBeGreaterThan(40);
  });

  it('picks a palette colour deterministically', () => {
    const colour = paletteColor('abc');
    expect(AVATAR_PALETTE).toContain(colour);
    expect(paletteColor('abc')).toBe(colour);
    expect(paletteColor('abc', ['#111111'])).toBe('#111111');
  });
});

describe('curved screen depth', () => {
  it('is flat without a sagitta', () => {
    expect(curvedScreenZ(3, 11.5, 0)).toBe(0);
  });

  it('is zero at the centre and the sagitta at the edges', () => {
    expect(curvedScreenZ(0, 11.5, 0.4)).toBeCloseTo(0, 9);
    expect(curvedScreenZ(5.75, 11.5, 0.4)).toBeCloseTo(0.4, 9);
    expect(curvedScreenZ(-5.75, 11.5, 0.4)).toBeCloseTo(0.4, 9);
  });

  it('rises monotonically from the centre to an edge', () => {
    let previous = -Infinity;
    for (let x = 0; x <= 5.75; x += 0.25) {
      const z = curvedScreenZ(x, 11.5, 0.4);
      expect(z).toBeGreaterThanOrEqual(previous);
      previous = z;
    }
  });
});

describe('camera poses', () => {
  it('looks from the eye of the seat at the screen centre', () => {
    const seat = fixtureLayout.seats[0]!;
    const result = poseForSeat(fixtureLayout, seat.key);
    expect(result.atSeat).toBe(true);
    expect(result.pose.position).toEqual(seat.eye);
    expect(result.pose.target).toEqual(fixtureLayout.screen.center);
  });

  it('uses the overview for null and unknown keys', () => {
    for (const key of [null, 'nope.r1.s1']) {
      const result = poseForSeat(fixtureLayout, key);
      expect(result.atSeat).toBe(false);
      expect(result.pose).toEqual(overviewPose(fixtureLayout));
    }
  });

  it('puts the overview above the eyes and behind every seat', () => {
    const overview = overviewPose(fixtureLayout);
    const lastRow = Math.max(...fixtureLayout.seats.map((s) => s.position.z));
    expect(overview.position.y).toBeGreaterThan(fixtureLayout.eyeHeight);
    expect(overview.position.z).toBeGreaterThan(lastRow);
    expect(overview.target).toEqual(fixtureLayout.screen.center);
  });

  it('reports yaw 0 when looking straight at the screen', () => {
    const pose: CameraPose = { position: { x: 0, y: 1, z: 5 }, target: { x: 0, y: 1, z: 0 } };
    const { yaw, pitch, distance } = lookAngles(pose);
    expect(yaw).toBeCloseTo(0, 9);
    expect(pitch).toBeCloseTo(0, 9);
    expect(distance).toBeCloseTo(5, 9);
  });

  it('keeps the target when the look offsets are zero', () => {
    const pose: CameraPose = { position: { x: 0, y: 1, z: 5 }, target: { x: 0, y: 2, z: 0 } };
    const same = applyLook(pose, 0, 0);
    expect(same.target.x).toBeCloseTo(0, 9);
    expect(same.target.y).toBeCloseTo(2, 9);
    expect(same.target.z).toBeCloseTo(0, 9);
  });

  it('turns the view around the eye without changing the distance', () => {
    const pose: CameraPose = { position: { x: 0, y: 1, z: 5 }, target: { x: 0, y: 2, z: 0 } };
    const before = lookAngles(pose).distance;
    const turned = applyLook(pose, 0.5, 0.1);
    expect(turned.position).toEqual(pose.position);
    expect(lookAngles(turned).distance).toBeCloseTo(before, 6);
    expect(lookAngles(turned).yaw).toBeCloseTo(0.5, 6);
  });

  it('clamps an angle to its range', () => {
    expect(clampAngle(2, -1, 1)).toBe(1);
    expect(clampAngle(-2, -1, 1)).toBe(-1);
    expect(clampAngle(0.3, -1, 1)).toBe(0.3);
  });
});

describe('hall anchors and decals', () => {
  it('places the screen, walls and ceiling in metres', () => {
    const anchors = hallAnchors(fixtureLayout);
    expect(anchors.screen.center.y).toBeCloseTo(1.2 + 4.8 / 2, 6);
    expect(anchors.screen.center.z).toBe(0);
    expect(anchors.screen.width).toBe(11.5);
    expect(anchors.backWall.center.z).toBe(16);
    expect(anchors.leftWall.center.x).toBe(-7);
    expect(anchors.rightWall.center.x).toBe(7);
    expect(anchors.leftWall.depth).toBe(16);
    expect(anchors.ceiling.y).toBe(8);
  });

  it('places decals on the requested wall', () => {
    const back = decalPlacement({ wall: 'back', offset: [1, 3] }, fixtureLayout.hall);
    expect(back.position).toEqual({ x: 1, y: 3, z: 16 - 0.02 });
    const left = decalPlacement({ wall: 'left' }, fixtureLayout.hall);
    expect(left.position.x).toBeCloseTo(-7 + 0.02, 9);
    expect(left.position.z).toBe(8);
    expect(left.position.y).toBe(4);
    expect(decalPlacement({ wall: 'right' }, fixtureLayout.hall).rotationY).toBeCloseTo(
      -Math.PI / 2,
      9,
    );
  });
});

describe('texture cover fit', () => {
  it('crops the sides of a wide image', () => {
    const { repeat, offset } = coverFit(1920, 1080, 1);
    expect(repeat[0]).toBeCloseTo(1080 / 1920 / (1 / 1), 6);
    expect(repeat[1]).toBe(1);
    expect(offset[0]).toBeCloseTo((1 - repeat[0]) / 2, 9);
  });

  it('crops the top and bottom of a tall image', () => {
    const { repeat, offset } = coverFit(1000, 2000, 2);
    expect(repeat[0]).toBe(1);
    expect(repeat[1]).toBeCloseTo(0.25, 9);
    expect(offset[1]).toBeCloseTo(0.375, 9);
  });

  it('does nothing when the aspects match or the size is unknown', () => {
    expect(coverFit(800, 400, 2).repeat).toEqual([1, 1]);
    expect(coverFit(0, 0, 1)).toEqual({ repeat: [1, 1], offset: [0, 0] });
  });
});

describe('ceiling spots', () => {
  it('forms a grid inside the ceiling, clear of the screen', () => {
    const spots = ceilingLightSpots(fixtureLayout.hall);
    expect(spots).toHaveLength(25);
    for (const spot of spots) {
      expect(Math.abs(spot.x)).toBeLessThan(7);
      expect(spot.z).toBeGreaterThan(0.5);
      expect(spot.z).toBeLessThan(15.5);
      expect(spot.y).toBeCloseTo(7.98, 9);
    }
  });
});

describe('restored device pixel ratio', () => {
  it('returns to the ratio the flight started from, within [1, maxDpr]', () => {
    expect(restoredDpr(2, 2)).toBe(2);
    expect(restoredDpr(2, 1)).toBe(1);
    expect(restoredDpr(0.5, 2)).toBe(1);
    expect(restoredDpr(Number.NaN, 2)).toBe(1);
  });
});
