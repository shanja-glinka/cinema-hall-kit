import { useRef } from 'react';
import type { SceneOptions } from './types.js';

/**
 * Keeps the previous reference while `same` says the new value is equal, so inline objects do not
 * rebuild the scene on every render.
 */
export function useStable<T>(value: T, same: (a: T, b: T) => boolean): T {
  const ref = useRef(value);
  if (ref.current !== value && !same(ref.current, value)) ref.current = value;
  return ref.current;
}

/** Equal by value for plain data (JSON). Functions are not data: use identity for them. */
export function sameJson<T>(a: T, b: T): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Whether two scene options are equal for rendering. JSON-like fields compare by value. The avatar
 * options compare by the identity of their geometry, tint and head-texture references, so a new
 * object with the same functions counts as equal.
 */
export function sameScene(a: SceneOptions | undefined, b: SceneOptions | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.curtains === b.curtains &&
    a.ceilingLights === b.ceilingLights &&
    a.maxDpr === b.maxDpr &&
    sameJson(a.seatModels, b.seatModels) &&
    sameJson(a.decals, b.decals) &&
    sameJson(a.camera, b.camera) &&
    sameAvatar(a.avatar, b.avatar)
  );
}

function sameAvatar(a: SceneOptions['avatar'], b: SceneOptions['avatar']): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  return a.geometry === b.geometry && a.tint === b.tint && a.headTexture === b.headTexture;
}
