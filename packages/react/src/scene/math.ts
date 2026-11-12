import type { HallLayout, SeatKey, Vec3 } from '@cinema-hall/core';
import type { CameraPose, Decal, HallAnchors } from './types.js';

/** Cushion top above the row floor, metres. */
export const SEAT_TOP = 0.46;
/** Centre of a seated body above the row floor, metres. */
export const BODY_CENTRE = 0.72;
/** Centre of a head above the row floor before the per-avatar offset, metres. */
export const HEAD_BASE = 1.07;
/** Radius of an avatar's sphere head, in metres. */
export const HEAD_RADIUS = 0.105;
/** A head is at most this far (metres) above or below HEAD_BASE. */
export const HEAD_JITTER = 0.07;
/** At most this many avatars get a textured (sprite) head; the rest keep the sphere. */
export const MAX_TEXTURED_HEADS = 32;
/** Default vertical field of view of the seat-view camera, in degrees. */
export const DEFAULT_FOV = 60;
/** Default length of a flight between seats, in milliseconds. */
export const DEFAULT_FLIGHT_MS = 1200;
/** Default height in metres that the camera rises at the middle of a flight. */
export const DEFAULT_ARC_HEIGHT = 1.2;
/** Duration of the animated return to the screen centre, in milliseconds. */
export const RESET_LOOK_MS = 400;
/**
 * Default look range to the left and right, in degrees, as `[min, max]` relative to the screen
 * centre.
 */
export const DEFAULT_YAW_RANGE: readonly [number, number] = [-70, 70];
/** Default look range up and down, in degrees, as `[min, max]` relative to the screen centre. */
export const DEFAULT_PITCH_RANGE: readonly [number, number] = [-30, 25];

const MAX_PITCH = 1.5;

/** Muted silhouette colours used when neither the host nor the avatar gives one. */
export const AVATAR_PALETTE: readonly string[] = [
  '#6E5A6B',
  '#4F6B78',
  '#7C6A4E',
  '#5C7A5A',
  '#86585A',
  '#55597A',
  '#7A7060',
  '#5F5F69',
];

/** Converts degrees to radians. */
export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** FNV-1a, 32-bit unsigned: the same seed always gives the same number. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Final avalanche (murmur3 fmix32): seeds that differ in one character still spread out.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** A number in [0, 1) derived from the seed. */
export function unitHash(seed: string): number {
  return hashSeed(seed) / 0x100000000;
}

/** Height offset of a head in metres, in [-HEAD_JITTER, HEAD_JITTER). */
export function headOffset(seed: string): number {
  return (unitHash(seed) * 2 - 1) * HEAD_JITTER;
}

/**
 * A colour from the palette, picked by the hash of `seed`. The same seed always gets the same
 * colour.
 */
export function paletteColor(seed: string, palette: readonly string[] = AVATAR_PALETTE): string {
  return palette[hashSeed(seed) % palette.length] ?? '#5F5F69';
}

/**
 * Depth (Z) of a point of a curved screen, relative to the centre (z = 0). The screen is a circular
 * arc whose edges sit `sagitta` closer to the audience (+Z) than its centre.
 */
export function curvedScreenZ(x: number, width: number, sagitta: number): number {
  if (!(sagitta > 0) || !(width > 0)) return 0;
  const half = width / 2;
  const radius = (half * half + sagitta * sagitta) / (2 * sagitta);
  return radius - Math.sqrt(Math.max(0, radius * radius - x * x));
}

/** A copy of a pose. The copy shares no objects with the original. */
export function copyPose(pose: CameraPose): CameraPose {
  return { position: { ...pose.position }, target: { ...pose.target } };
}

/**
 * Linear interpolation between two points, component by component. A `t` of 0 gives `a` and 1 gives
 * `b`. Values outside 0 to 1 extrapolate.
 */
export function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

/**
 * Straight interpolation of position and target, with the position lifted by sin(π·t)·arcHeight.
 */
export function arcPose(
  from: CameraPose,
  to: CameraPose,
  t: number,
  arcHeight: number,
): CameraPose {
  const position = lerpVec(from.position, to.position, t);
  return {
    position: { ...position, y: position.y + Math.sin(Math.PI * t) * arcHeight },
    target: lerpVec(from.target, to.target, t),
  };
}

/**
 * Clamps `value` to `[min, max]`. Despite the name, it works for any number: degrees, radians or
 * metres.
 */
export function clampAngle(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Yaw (0 = looking at −Z), pitch and distance of the view direction of a pose. */
export function lookAngles(pose: CameraPose): { yaw: number; pitch: number; distance: number } {
  const dx = pose.target.x - pose.position.x;
  const dy = pose.target.y - pose.position.y;
  const dz = pose.target.z - pose.position.z;
  const distance = Math.hypot(dx, dy, dz) || 1;
  return {
    yaw: Math.atan2(dx, -dz),
    pitch: Math.asin(clampAngle(dy / distance, -1, 1)),
    distance,
  };
}

/**
 * The same eye point, looking `yawOffset` / `pitchOffset` (radians) away from the current
 * direction.
 */
export function applyLook(pose: CameraPose, yawOffset: number, pitchOffset: number): CameraPose {
  const { yaw, pitch, distance } = lookAngles(pose);
  const nextYaw = yaw + yawOffset;
  const nextPitch = clampAngle(pitch + pitchOffset, -MAX_PITCH, MAX_PITCH);
  const horizontal = Math.cos(nextPitch) * distance;
  return {
    position: { ...pose.position },
    target: {
      x: pose.position.x + Math.sin(nextYaw) * horizontal,
      y: pose.position.y + Math.sin(nextPitch) * distance,
      z: pose.position.z - Math.cos(nextYaw) * horizontal,
    },
  };
}

/** Overview: behind and above the audience, looking at the screen centre. */
export function overviewPose(layout: HallLayout): CameraPose {
  const { hall, screen } = layout;
  return {
    position: { x: 0, y: hall.height * 0.8, z: Math.max(0.3, hall.depth - 0.6) },
    target: { ...screen.center },
  };
}

/**
 * Eye point of the seat looking at the screen centre; the overview when the key is null or unknown.
 */
export function poseForSeat(
  layout: HallLayout,
  key: SeatKey | null,
): { pose: CameraPose; atSeat: boolean } {
  const seat = key === null ? undefined : layout.seats.find((s) => s.key === key);
  if (seat) {
    return {
      pose: { position: { ...seat.eye }, target: { ...layout.screen.center } },
      atSeat: true,
    };
  }
  return { pose: overviewPose(layout), atSeat: false };
}

/** Surface anchors of a layout, in metres (see `HallAnchors`). Used by `HallAnchorsProvider`. */
export function hallAnchors(layout: HallLayout): HallAnchors {
  const { hall, screen } = layout;
  const middleHeight = hall.height / 2;
  return {
    screen: { center: { ...screen.center }, width: screen.width, height: screen.height },
    backWall: {
      center: { x: 0, y: middleHeight, z: hall.depth },
      width: hall.width,
      height: hall.height,
    },
    leftWall: {
      center: { x: -hall.width / 2, y: middleHeight, z: hall.depth / 2 },
      depth: hall.depth,
      height: hall.height,
    },
    rightWall: {
      center: { x: hall.width / 2, y: middleHeight, z: hall.depth / 2 },
      depth: hall.depth,
      height: hall.height,
    },
    ceiling: { y: hall.height },
  };
}

/** Texture repeat and offset that cover an aspect without distortion (crop the longer side). */
export function coverFit(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number,
): { repeat: [number, number]; offset: [number, number] } {
  if (!(mediaWidth > 0) || !(mediaHeight > 0) || !(aspect > 0)) {
    return { repeat: [1, 1], offset: [0, 0] };
  }
  const mediaAspect = mediaWidth / mediaHeight;
  if (mediaAspect > aspect) {
    const rx = aspect / mediaAspect;
    return { repeat: [rx, 1], offset: [(1 - rx) / 2, 0] };
  }
  const ry = mediaAspect / aspect;
  return { repeat: [1, ry], offset: [0, (1 - ry) / 2] };
}

/** Clamps each component of a point to the matching component of `min` and `max`. */
export function clampVec(v: Vec3, min: Vec3, max: Vec3): Vec3 {
  return {
    x: clampAngle(v.x, min.x, max.x),
    y: clampAngle(v.y, min.y, max.y),
    z: clampAngle(v.z, min.z, max.z),
  };
}

/** Ceiling spot positions: a regular grid kept clear of the screen and the back wall. */
export function ceilingLightSpots(hall: HallLayout['hall']): Vec3[] {
  const columns = Math.max(2, Math.round(hall.width / 3));
  const rows = Math.max(2, Math.round((hall.depth - 1.6) / 3));
  const spots: Vec3[] = [];
  for (let c = 0; c < columns; c++) {
    for (let r = 0; r < rows; r++) {
      spots.push({
        x: -hall.width / 2 + ((c + 0.5) * hall.width) / columns,
        y: hall.height - 0.02,
        z: 0.8 + ((r + 0.5) * (hall.depth - 1.6)) / rows,
      });
    }
  }
  return spots;
}

/**
 * Where a decal plane stands. `offset` is [horizontal, height above the floor]; on the side walls
 * the
 * horizontal value is measured from the middle of the wall (positive towards the back).
 */
export function decalPlacement(
  decal: Pick<Decal, 'wall' | 'offset'>,
  hall: HallLayout['hall'],
): { position: Vec3; rotationY: number } {
  const [horizontal = 0, height = hall.height / 2] = decal.offset ?? [];
  switch (decal.wall) {
    case 'back':
      return { position: { x: horizontal, y: height, z: hall.depth - 0.02 }, rotationY: Math.PI };
    case 'left':
      return {
        position: { x: -hall.width / 2 + 0.02, y: height, z: hall.depth / 2 + horizontal },
        rotationY: Math.PI / 2,
      };
    case 'right':
      return {
        position: { x: hall.width / 2 - 0.02, y: height, z: hall.depth / 2 + horizontal },
        rotationY: -Math.PI / 2,
      };
  }
}

/**
 * The device pixel ratio while a flight runs: `base × scale`, kept within [1, maxDpr]. The ratio
 * never goes
 * below 1, so on a 1× screen a flight lowers nothing; a non-finite result falls back to 1.
 */
export function flightDpr(base: number, scale: number, maxDpr: number): number {
  const wanted = base * scale;
  if (!Number.isFinite(wanted)) return 1;
  return Math.min(Math.max(1, maxDpr), Math.max(1, wanted));
}

/**
 * The ratio a lowered flight hands back: the ratio it started from, kept within [1, maxDpr] as it
 * is now.
 */
export function restoredDpr(base: number, maxDpr: number): number {
  return flightDpr(base, 1, maxDpr);
}
