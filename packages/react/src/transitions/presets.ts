import type { CameraPath } from '../scene/types.js';
import type { Easing } from './easing.js';

/** Phase names in timeline order. */
export type PhaseName = 'mapZoom' | 'crossfade' | 'cameraFlight' | 'sheetIn';

/** Named transition presets. */
export type TransitionPresetName = 'cinematic' | 'subtle';
/** `full` plays every phase, `reduced` only short fades, `off` switches at once. */
export type MotionMode = 'full' | 'reduced' | 'off';

/** Timing shared by every phase. `delay` shifts the phase start. */
export type Phase<T = unknown> = T & {
  duration?: number;
  delay?: number;
  ease?: Easing;
};

/** Options of the map zoom phase. */
export interface MapZoomOptions {
  /** Scale of the map at the end of the zoom, relative to the selected seat. */
  maxScale?: number;
  /** Blur of the map at the peak of the zoom, px (max 16). */
  blur?: number;
}

/** Options of the map/3D crossfade phase. */
export interface CrossfadeOptions {
  /** Blur of the view layer at the start of the crossfade, px (max 16). */
  blur?: number;
  /** How much the crossfade starts before the map zoom ends, ms. */
  overlap?: number;
}

/** Options of the camera flight phase. */
export interface CameraFlightOptions {
  path?: CameraPath;
  /** Height of the default arc above the straight line, metres. 0 = straight. */
  arcHeight?: number;
}

/** Per-phase overrides of a preset. */
export interface TransitionConfig {
  preset?: TransitionPresetName;
  /** The only motion axis; default follows `prefers-reduced-motion`. */
  motion?: MotionMode;
  quality?: 'high' | 'low';
  mapZoom?: Phase<MapZoomOptions> | false;
  crossfade?: Phase<CrossfadeOptions> | false;
  cameraFlight?: Phase<CameraFlightOptions> | false;
  sheetIn?: Phase | false;
  /** Playback rate of the reverse direction (time runs at this speed backwards). */
  reverseSpeed?: number;
}

/** A preset name, `none`, or a config. */
export type TransitionsProp = 'cinematic' | 'subtle' | 'none' | TransitionConfig;

/** A phase with every value decided by a preset or the caller. */
export interface PhaseDefaults {
  duration: number;
  delay: number;
  ease: Easing;
}

/** Map zoom phase with every field set. */
export interface MapZoomDefaults extends PhaseDefaults {
  maxScale: number;
  blur: number;
}

/** Crossfade phase with every field set. */
export interface CrossfadeDefaults extends PhaseDefaults {
  blur: number;
  overlap: number;
}

/** Camera flight phase with every field set. */
export interface CameraFlightDefaults extends PhaseDefaults {
  path: CameraPath | undefined;
  arcHeight: number;
}

/** The fully expanded configuration: presets applied, overrides merged, `false` kept as a skip. */
export interface ExpandedTransitions {
  preset: TransitionPresetName | 'none';
  motion: MotionMode | undefined;
  quality: 'high' | 'low';
  reverseSpeed: number;
  mapZoom: MapZoomDefaults | false;
  crossfade: CrossfadeDefaults | false;
  cameraFlight: CameraFlightDefaults | false;
  sheetIn: PhaseDefaults | false;
}

const CINEMATIC: Omit<ExpandedTransitions, 'preset' | 'motion' | 'quality'> = {
  reverseSpeed: 0.7,
  mapZoom: { duration: 450, delay: 0, ease: 'easeInOut', maxScale: 2.4, blur: 12 },
  crossfade: { duration: 350, delay: 0, ease: 'easeInOut', blur: 16, overlap: 150 },
  cameraFlight: {
    duration: 1200,
    delay: 0,
    ease: 'easeInOutCubic',
    path: undefined,
    arcHeight: 1.6,
  },
  sheetIn: { duration: 300, delay: 0, ease: 'easeOut' },
};

const SUBTLE: Omit<ExpandedTransitions, 'preset' | 'motion' | 'quality'> = {
  reverseSpeed: 0.7,
  mapZoom: { duration: 280, delay: 0, ease: 'easeInOut', maxScale: 1.6, blur: 4 },
  crossfade: { duration: 220, delay: 0, ease: 'easeInOut', blur: 6, overlap: 80 },
  cameraFlight: { duration: 800, delay: 0, ease: 'easeInOut', path: undefined, arcHeight: 0 },
  sheetIn: { duration: 220, delay: 0, ease: 'easeOut' },
};

const NONE: Omit<ExpandedTransitions, 'preset' | 'motion' | 'quality'> = {
  reverseSpeed: 0.7,
  mapZoom: false,
  crossfade: false,
  cameraFlight: false,
  sheetIn: false,
};

/**
 * Applies a preset and the caller's per-phase overrides. `false` skips a phase.
 * @param input - The `transitions` prop.
 * @returns Every phase option filled in.
 */
export function expandTransitions(input: TransitionsProp | undefined): ExpandedTransitions {
  if (input === 'none') return { preset: 'none', motion: undefined, quality: 'high', ...NONE };
  if (input === undefined || typeof input === 'string') {
    const name: TransitionPresetName = input === 'subtle' ? 'subtle' : 'cinematic';
    return {
      preset: name,
      motion: undefined,
      quality: 'high',
      ...(name === 'subtle' ? SUBTLE : CINEMATIC),
    };
  }
  const name: TransitionPresetName = input.preset ?? 'cinematic';
  const base = name === 'subtle' ? SUBTLE : CINEMATIC;
  return {
    preset: name,
    motion: input.motion,
    quality: input.quality ?? 'high',
    reverseSpeed: input.reverseSpeed ?? base.reverseSpeed,
    mapZoom: mergePhase(base.mapZoom, input.mapZoom),
    crossfade: mergePhase(base.crossfade, input.crossfade),
    cameraFlight: mergePhase(base.cameraFlight, input.cameraFlight),
    sheetIn: mergePhase(base.sheetIn, input.sheetIn),
  } as ExpandedTransitions;
}

function mergePhase<T extends PhaseDefaults>(
  base: T | false,
  over: object | false | undefined,
): T | false {
  if (over === false) return false;
  if (base === false) return false;
  if (over === undefined) return base;
  return { ...base, ...stripUndefined(over) } as T;
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(value) as (keyof T)[]) {
    if (value[key] !== undefined) out[key] = value[key];
  }
  return out;
}
