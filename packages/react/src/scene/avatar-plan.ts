import {
  createStatusLookup,
  type Avatars,
  type HallLayout,
  type Occupancy,
  type Seat,
  type SeatKey,
  type Vec3,
} from '@cinema-hall/core';
import { BODY_CENTRE, HEAD_BASE, headOffset, MAX_TEXTURED_HEADS, paletteColor } from './math.js';
import type { AvatarOptions, SceneOptions } from './types.js';

/**
 * Options for `planAvatars`: a tint and a photo per seat, and the number of photos that may be
 * drawn as textured heads (32 by default).
 */
export interface AvatarPlanOptions {
  tint?: (key: SeatKey) => string;
  headTexture?: (key: SeatKey) => string | undefined;
  maxTextured?: number;
}

/**
 * Appearance and placement of one avatar, in metres. `bodyPosition` and `headPosition` are the
 * centres of the body and the head. `textured` says that the head should show its photo, which is
 * drawn once the photo has loaded (see `splitHeads`).
 */
export interface AvatarSpec {
  key: SeatKey;
  seed: string;
  color: string;
  bodyPosition: Vec3;
  headPosition: Vec3;
  imageUrl?: string;
  /** Drawn as a textured billboard instead of the instanced sphere head. */
  textured: boolean;
}

/** Shared empty options: an avatar layer with the built-in silhouettes. */
export const EMPTY_AVATAR: AvatarOptions = {};

/** `none` hides avatars; `undefined` and `silhouette` use the built-in silhouettes. */
export function avatarOptionsOf(avatar: SceneOptions['avatar']): AvatarOptions | null {
  if (avatar === 'none') return null;
  if (avatar === undefined || avatar === 'silhouette') return EMPTY_AVATAR;
  return avatar;
}

/** Seats whose status is `taken`, in layout order, without the seat the camera sits in. */
export function takenSeats(
  layout: HallLayout,
  occupancy: Occupancy | undefined,
  exclude: SeatKey | null,
): Seat[] {
  const status = createStatusLookup(occupancy);
  return layout.seats.filter((seat) => seat.key !== exclude && status(seat.key) === 'taken');
}

/**
 * Per-avatar appearance and placement. Deterministic: the same seats and data give the same result.
 */
export function planAvatars(
  seats: readonly Seat[],
  avatars: Avatars | undefined,
  options: AvatarPlanOptions = {},
): AvatarSpec[] {
  const limit = options.maxTextured ?? MAX_TEXTURED_HEADS;
  let textured = 0;
  return seats.map((seat) => {
    const info = avatars?.[seat.key];
    const seed = info?.seed ?? seat.key;
    const color = options.tint?.(seat.key) ?? info?.color ?? paletteColor(seed);
    const requested = info?.imageUrl || options.headTexture?.(seat.key) || undefined;
    const isTextured = requested !== undefined && textured < limit;
    if (isTextured) textured++;
    const { x, z } = seat.position;
    return {
      key: seat.key,
      seed,
      color,
      bodyPosition: { x, y: seat.position.y + BODY_CENTRE, z },
      headPosition: { x, y: seat.position.y + HEAD_BASE + headOffset(seed), z },
      ...(isTextured ? { imageUrl: requested } : {}),
      textured: isTextured,
    };
  });
}

/**
 * Splits the avatars into the sprites and the instanced sphere heads. A textured head is a sprite
 * only once
 * its photo has loaded; a photo that is still loading, or has failed, keeps the sphere in the
 * shared batch.
 */
export function splitHeads(
  specs: readonly AvatarSpec[],
  loaded: ReadonlySet<SeatKey>,
): { sprites: AvatarSpec[]; heads: AvatarSpec[] } {
  const sprites: AvatarSpec[] = [];
  const heads: AvatarSpec[] = [];
  for (const spec of specs) {
    if (spec.textured && spec.imageUrl && loaded.has(spec.key)) sprites.push(spec);
    else heads.push(spec);
  }
  return { sprites, heads };
}
