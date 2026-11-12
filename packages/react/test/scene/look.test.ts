import { describe, expect, it } from 'vitest';
import {
  clearLook,
  dragLook,
  freshLook,
  gyroLook,
  startReset,
  stepLook,
} from '../../src/scene/look.js';
import { degToRad, RESET_LOOK_MS } from '../../src/scene/math.js';

const yawRange = [degToRad(-70), degToRad(70)] as const;
const pitchRange = [degToRad(-30), degToRad(25)] as const;

describe('look-around', () => {
  it('clamps the yaw target to its range; dragging left turns the view right', () => {
    const look = freshLook();
    dragLook(look, -10000, 0, yawRange, pitchRange);
    expect(look.targetYaw).toBeCloseTo(degToRad(70), 9);
    dragLook(look, 100000, 0, yawRange, pitchRange);
    expect(look.targetYaw).toBeCloseTo(degToRad(-70), 9);
  });

  it('clamps the pitch target separately', () => {
    const look = freshLook();
    dragLook(look, 0, 100000, yawRange, pitchRange);
    expect(look.targetPitch).toBeCloseTo(degToRad(25), 9);
  });

  it('smooths towards the target and settles', () => {
    const look = freshLook();
    dragLook(look, -200, 0, yawRange, pitchRange);
    let now = 1000;
    let moving = true;
    let frames = 0;
    while (moving && frames < 500) {
      now += 16;
      moving = stepLook(look, now);
      frames++;
    }
    expect(moving).toBe(false);
    expect(frames).toBeLessThan(500);
    expect(look.yaw).toBeCloseTo(look.targetYaw, 3);
  });

  it('turns back to the centre over the reset duration', () => {
    const look = freshLook();
    look.yaw = degToRad(20);
    startReset(look, 0);
    expect(stepLook(look, RESET_LOOK_MS / 2)).toBe(true);
    expect(look.yaw).toBeGreaterThan(0);
    expect(look.yaw).toBeLessThan(degToRad(20));
    expect(stepLook(look, RESET_LOOK_MS + 1)).toBe(false);
    expect(look.yaw).toBe(0);
    expect(look.tween).toBeNull();
  });

  it('clearing forgets the offsets but keeps the gyro baseline', () => {
    const look = freshLook();
    dragLook(look, -200, 50, yawRange, pitchRange);
    gyroLook(look, 10, 20, 1);
    clearLook(look);
    expect(look.targetYaw).toBe(0);
    expect(look.targetPitch).toBe(0);
    expect(look.gyroBase).toEqual({ gamma: 10, beta: 20 });
  });

  it('measures gyro offsets from the first sample', () => {
    const look = freshLook();
    gyroLook(look, 10, 20, 1);
    expect(look.gyroYaw).toBeCloseTo(0, 12);
    gyroLook(look, 15, 20, 1);
    expect(look.gyroYaw).toBeCloseTo(-degToRad(5), 9);
    expect(look.gyroPitch).toBeCloseTo(0, 9);
  });
});
