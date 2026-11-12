import type { BufferGeometry } from 'three';
import type { HallLayout, SeatKey, Vec3 } from '@cinema-hall/core';
import type { Easing } from '../transitions/easing.js';

/** A camera pose in metres: where the eye is, and the point it looks at. */
export interface CameraPose {
  /** Eye position, in metres. */
  position: Vec3;
  /** Point that the camera looks at, in metres. */
  target: Vec3;
}

/** Custom camera path for the flight: `t` is eased progress 0…1. */
export type CameraPath = (
  t: number,
  ctx: { from: CameraPose; to: CameraPose; layout: HallLayout },
) => CameraPose;

/**
 * How the camera flies between seats. `SeatView` flies for 1.2 seconds by default. `flight: false`
 * on `SeatView` jumps instead.
 */
export interface FlightOptions {
  /** Flight length in milliseconds. */
  duration: number;
  ease?: Easing;
  /** Default: an arc that rises by `arcHeight` above the straight line. */
  path?: CameraPath;
  /**
   * Height in metres that the camera rises at the middle of the flight, above the straight line.
   * Default 1.2.
   */
  arcHeight?: number;
  /** Device-pixel-ratio multiplier while flying (cheap frames hidden by blur). 1 = keep. */
  lowResScale?: number;
}

/**
 * GLB contract: metres, origin at the centre of the seat footprint on the floor, +Z faces the
 * screen.
 */
export interface SeatModelSource {
  url: string;
  scale?: number;
  /** Material whose colour is replaced by the seat colour (selected seat → accent). */
  tintMaterial?: string;
}

/**
 * Appearance of the avatars on taken seats. Every field is optional. The built-in silhouettes are
 * used when none are given.
 */
export interface AvatarOptions {
  /**
   * Body geometry in place of the built-in capsule. The host keeps ownership of it: the scene does
   * not dispose it.
   */
  geometry?: BufferGeometry;
  /** Colour per occupied seat (CSS colour). */
  tint?: (key: SeatKey) => string;
  /** Head texture URL per occupied seat; must be CORS-enabled. */
  headTexture?: (key: SeatKey) => string | undefined;
}

/** An image on a wall of the hall. The height of the image follows its aspect ratio. */
export interface Decal {
  /** The wall. `back` is the wall behind the audience. `left` and `right` are the side walls. */
  wall: 'back' | 'left' | 'right';
  /** URL of the image. It must allow CORS, because it is used as a WebGL texture. */
  src: string;
  /** Width in metres; height follows the image aspect. */
  width: number;
  /** Offset of the decal centre on the wall: [horizontal, height above floor], metres. */
  offset?: [number, number];
}

/**
 * Options for the 3D scene of `SeatView` and `HallPreview`. Every field is optional. The defaults
 * give a hall with procedural seats, silhouette avatars, curtains and ceiling lights.
 */
export interface SceneOptions {
  /** Per seat type: `procedural` (the default) or a GLB model. */
  seatModels?: Record<string, 'procedural' | SeatModelSource>;
  /**
   * `silhouette` draws the built-in figures, `none` hides the avatars, and an options object
   * customises them.
   */
  avatar?: 'silhouette' | 'none' | AvatarOptions;
  /** Images on the walls of the hall. */
  decals?: Decal[];
  /** Draw curtains on the side walls. Default `true`. */
  curtains?: boolean;
  /** Draw the ceiling lights. Default `true`. */
  ceilingLights?: boolean;
  camera?: {
    /** Vertical field of view of the camera, degrees. Default 60. */
    fov?: number;
    look?: { yaw?: [number, number]; pitch?: [number, number] };
    gyro?: boolean;
  };
  /** Upper bound for the device pixel ratio. Default 2. */
  maxDpr?: number;
}

/**
 * Surfaces of the hall, in metres, for placing React Three Fiber children with `useHallAnchors()`:
 * centres and sizes of the screen and the walls, and the ceiling height.
 */
export interface HallAnchors {
  screen: { center: Vec3; width: number; height: number };
  backWall: { center: Vec3; width: number; height: number };
  leftWall: { center: Vec3; depth: number; height: number };
  rightWall: { center: Vec3; depth: number; height: number };
  ceiling: { y: number };
}
