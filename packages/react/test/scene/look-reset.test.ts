import { describe, expect, it } from 'vitest';
import {
  clearGyro,
  freshLook,
  GYRO_GAIN,
  gyroLook,
  startReset,
  stepLook,
} from '../../src/scene/look.js';
import { RESET_LOOK_MS } from '../../src/scene/math.js';

describe('reset look', () => {
  it('animates the whole displayed offset, gyro included, back to the centre', () => {
    const look = freshLook();
    look.yaw = 0.2;
    look.pitch = -0.1;
    look.gyroYaw = 0.3;
    look.gyroPitch = 0.05;
    startReset(look, 1000);

    stepLook(look, 1000);
    expect(look.yaw).toBeCloseTo(0.5, 9);
    expect(look.pitch).toBeCloseTo(-0.05, 9);
    expect(look.gyroYaw).toBeCloseTo(0, 12);

    stepLook(look, 1000 + RESET_LOOK_MS / 2);
    expect(look.yaw).toBeGreaterThan(0);
    expect(look.yaw).toBeLessThan(0.5);

    expect(stepLook(look, 1000 + RESET_LOOK_MS + 1)).toBe(false);
    expect(look.yaw).toBe(0);
    expect(look.pitch).toBe(0);
  });

  it('rebases the gyro, so the device attitude at the reset becomes the centre', () => {
    const look = freshLook();
    gyroLook(look, 10, 20, GYRO_GAIN);
    gyroLook(look, 30, 25, GYRO_GAIN);
    expect(look.gyroYaw).not.toBe(0);

    startReset(look, 0);
    expect(look.gyroYaw).toBeCloseTo(0, 12);
    expect(look.gyroPitch).toBe(0);

    gyroLook(look, 30, 25, GYRO_GAIN);
    expect(look.gyroYaw).toBeCloseTo(0, 12);
    expect(look.gyroPitch).toBe(0);
  });

  it('a reset without gyro turns back from the drag offset alone', () => {
    const look = freshLook();
    look.yaw = -0.4;
    startReset(look, 0);
    expect(stepLook(look, RESET_LOOK_MS + 1)).toBe(false);
    expect(look.yaw).toBe(0);
  });

  it('clearing the gyro forgets its offsets and baseline', () => {
    const look = freshLook();
    gyroLook(look, 10, 20, GYRO_GAIN);
    gyroLook(look, 15, 22, GYRO_GAIN);
    clearGyro(look);
    expect(look.gyroYaw).toBeCloseTo(0, 12);
    expect(look.gyroPitch).toBe(0);
    expect(look.gyroBase).toBeNull();
  });
});
