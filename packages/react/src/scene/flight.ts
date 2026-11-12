import type { HallLayout } from '@cinema-hall/core';
import { clamp01, resolveEasing, type Easing } from '../transitions/easing.js';
import { arcPose, copyPose, DEFAULT_ARC_HEIGHT } from './math.js';
import type { CameraPath, CameraPose } from './types.js';

/**
 * Direction of a flight. `to-seat` flies to a seat's eye point. `to-overview` flies back to the
 * overview pose.
 */
export type FlightDirection = 'to-seat' | 'to-overview';

/** A camera flight from one pose to another. Pure: the caller samples it once per frame. */
export interface FlightPlan {
  from: CameraPose;
  to: CameraPose;
  start: number;
  duration: number;
  ease: (t: number) => number;
  arcHeight: number;
  path?: CameraPath;
  layout: HallLayout;
  direction: FlightDirection;
}

/**
 * What a flight needs to be planned: the layout, the direction, the duration in milliseconds, and
 * optionally the easing, the arc height and a custom path.
 */
export interface FlightRequest {
  layout: HallLayout;
  direction: FlightDirection;
  duration: number;
  ease?: Easing;
  arcHeight?: number;
  path?: CameraPath;
}

/** `value` when it is a finite number, else `fallback`: NaN and ±Infinity never reach a plan. */
function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isFinitePose(pose: CameraPose): boolean {
  return [
    pose.position.x,
    pose.position.y,
    pose.position.z,
    pose.target.x,
    pose.target.y,
    pose.target.z,
  ].every((value) => Number.isFinite(value));
}

/**
 * `from` is the pose the camera has now, so an interrupted flight continues smoothly. A duration
 * that is
 * not a finite number (or is negative) makes an instant flight; a pose that is not finite is
 * replaced by
 * the other one.
 */
export function planFlight(
  from: CameraPose,
  to: CameraPose,
  now: number,
  request: FlightRequest,
): FlightPlan {
  const start = isFinitePose(from) ? from : to;
  const end = isFinitePose(to) ? to : start;
  return {
    from: copyPose(start),
    to: copyPose(end),
    start: now,
    duration: Math.max(0, finiteOr(request.duration, 0)),
    ease: resolveEasing(request.ease),
    arcHeight: finiteOr(request.arcHeight, DEFAULT_ARC_HEIGHT),
    path: request.path,
    layout: request.layout,
    direction: request.direction,
  };
}

/**
 * Time progress 0…1 (not eased). A zero-length flight is finished at once, and so is one whose
 * clock is not a number.
 */
export function flightProgress(plan: FlightPlan, now: number): number {
  if (plan.duration <= 0) return 1;
  const elapsed = now - plan.start;
  if (!Number.isFinite(elapsed)) return 1;
  return clamp01(elapsed / plan.duration);
}

/**
 * Samples a flight at time `now`, in milliseconds on the same clock as `plan.start`. Returns the
 * camera pose, the time progress (0 to 1, not eased) and whether the flight is `done`. Once it is
 * done, the pose is the plan's `to` pose.
 */
export function sampleFlight(
  plan: FlightPlan,
  now: number,
): { pose: CameraPose; progress: number; done: boolean } {
  const progress = flightProgress(plan, now);
  if (progress >= 1) return { pose: copyPose(plan.to), progress: 1, done: true };
  const eased = plan.ease(progress);
  const pose = plan.path
    ? plan.path(eased, { from: plan.from, to: plan.to, layout: plan.layout })
    : arcPose(plan.from, plan.to, eased, plan.arcHeight);
  return { pose, progress, done: false };
}
