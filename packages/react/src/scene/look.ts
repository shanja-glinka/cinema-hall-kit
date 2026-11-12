import { clamp01 } from '../transitions/easing.js';
import { clampAngle, RESET_LOOK_MS } from './math.js';

/** Radians of look per pixel of drag. */
export const DRAG_RADIANS_PER_PX = 0.0045;
/** Gyro degrees to look radians, gentle on purpose. */
export const GYRO_GAIN = 0.6;
const DAMPING_PER_SECOND = 14;
const MAX_STEP_SECONDS = 0.05;
const SETTLED = 1e-4;

/** Look-around state, in radians. Offsets are relative to the direction of the screen centre. */
export interface LookState {
  /** Where the drag wants to look. */
  targetYaw: number;
  targetPitch: number;
  /** What is shown now (smoothed towards the target). */
  yaw: number;
  pitch: number;
  gyroYaw: number;
  gyroPitch: number;
  gyroBase: { gamma: number; beta: number } | null;
  tween: { fromYaw: number; fromPitch: number; start: number } | null;
  last: number;
}

/** A look state at rest: no drag, no gyro offset and no reset running. */
export function freshLook(): LookState {
  return {
    targetYaw: 0,
    targetPitch: 0,
    yaw: 0,
    pitch: 0,
    gyroYaw: 0,
    gyroPitch: 0,
    gyroBase: null,
    tween: null,
    last: 0,
  };
}

/** Forgets the drag and the smoothed offsets. The gyro baseline stays. */
export function clearLook(look: LookState): void {
  look.targetYaw = 0;
  look.targetPitch = 0;
  look.yaw = 0;
  look.pitch = 0;
  look.tween = null;
}

/** Forgets the gyro offsets and baseline: the next device sample starts a new baseline. */
export function clearGyro(look: LookState): void {
  look.gyroYaw = 0;
  look.gyroPitch = 0;
  look.gyroBase = null;
}

/** Applies a drag in pixels; ranges are in radians. Dragging right turns the view left. */
export function dragLook(
  look: LookState,
  dx: number,
  dy: number,
  yawRange: readonly [number, number],
  pitchRange: readonly [number, number],
): void {
  look.targetYaw = clampAngle(look.targetYaw - dx * DRAG_RADIANS_PER_PX, yawRange[0], yawRange[1]);
  look.targetPitch = clampAngle(
    look.targetPitch + dy * DRAG_RADIANS_PER_PX,
    pitchRange[0],
    pitchRange[1],
  );
}

/**
 * Turns the view back to the screen centre over RESET_LOOK_MS. The tween starts from the whole
 * offset on
 * screen (drag and gyro), and the gyro baseline is rebased: the device's attitude at this moment
 * becomes
 * the centre, so the camera looks at the screen once the tween ends.
 */
export function startReset(look: LookState, now: number): void {
  look.tween = {
    fromYaw: look.yaw + look.gyroYaw,
    fromPitch: look.pitch + look.gyroPitch,
    start: now,
  };
  look.targetYaw = 0;
  look.targetPitch = 0;
  look.gyroYaw = 0;
  look.gyroPitch = 0;
  look.gyroBase = null;
}

/** Device orientation (degrees) relative to the first sample. */
export function gyroLook(look: LookState, gamma: number, beta: number, gain: number): void {
  if (!look.gyroBase) look.gyroBase = { gamma, beta };
  look.gyroYaw = -(gamma - look.gyroBase.gamma) * (Math.PI / 180) * gain;
  look.gyroPitch = (beta - look.gyroBase.beta) * (Math.PI / 180) * gain;
}

/** Advances the smoothing or the reset tween by one frame. Returns `true` while it still moves. */
export function stepLook(look: LookState, now: number): boolean {
  const dt = Math.min(MAX_STEP_SECONDS, Math.max(0, (now - look.last) / 1000));
  look.last = now;
  if (look.tween) {
    const t = clamp01((now - look.tween.start) / RESET_LOOK_MS);
    if (t >= 1) {
      clearLook(look);
      return false;
    }
    const eased = 1 - (1 - t) ** 3;
    look.yaw = look.tween.fromYaw * (1 - eased);
    look.pitch = look.tween.fromPitch * (1 - eased);
    return true;
  }
  const k = 1 - Math.exp(-DAMPING_PER_SECOND * dt);
  look.yaw += (look.targetYaw - look.yaw) * k;
  look.pitch += (look.targetPitch - look.pitch) * k;
  return (
    Math.abs(look.targetYaw - look.yaw) > SETTLED ||
    Math.abs(look.targetPitch - look.pitch) > SETTLED
  );
}
