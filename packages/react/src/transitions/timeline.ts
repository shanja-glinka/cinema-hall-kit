import type { CameraPath } from '../scene/types.js';
import { clamp01, resolveEasing, type Easing } from './easing.js';
import {
  expandTransitions,
  type MotionMode,
  type PhaseName,
  type TransitionsProp,
} from './presets.js';

export type { PhaseName } from './presets.js';

/** Which way the clock runs. */
export type Direction = 'forward' | 'backward';
/** Where the clock heads: the map or the view. */
export type Target = 'map' | 'view';

/** Phases in timeline order. */
export const PHASE_ORDER: readonly PhaseName[] = [
  'mapZoom',
  'crossfade',
  'cameraFlight',
  'sheetIn',
];

/** One phase placed on the timeline. */
export interface PhaseSpec {
  name: PhaseName;
  /** Start and end on the timeline, ms from the map state. */
  start: number;
  end: number;
  duration: number;
  ease: (t: number) => number;
  /** The easing as the caller wrote it (named, bezier or function), for libraries that take names. */
  source: Easing;
}

/** Camera flight settings of a resolved timeline. */
export interface FlightSpec {
  duration: number;
  ease: Easing;
  path: CameraPath | undefined;
  arcHeight: number;
  /** Device-pixel-ratio multiplier while flying. 1 when the canvas layer has no blur. */
  lowResScale: number;
}

/** A timeline ready to drive: phases placed on a single clock. */
export interface ResolvedTransition {
  phases: PhaseSpec[];
  total: number;
  reverseSpeed: number;
  motion: MotionMode;
  quality: 'high' | 'low';
  mapZoom: { maxScale: number; blur: number } | null;
  crossfade: { blur: number } | null;
  /** `null` when the camera flight is skipped: the view jumps to the seat. */
  flight: FlightSpec | null;
  /** Sheet opens only in this phase. */
  sheetIn: boolean;
  /** Where the layers swap when the crossfade is skipped (`crossfade: false`). */
  swapAt: number;
}

/** A phase boundary crossed by the clock. */
export interface TransitionEvent {
  phase: PhaseName;
  direction: Direction;
  state: 'start' | 'end';
}

const MAX_BLUR = 16;
const REDUCED_CROSSFADE_MS = 150;
const REDUCED_SHEET_MS = 150;
const DEFAULT_LOW_RES_SCALE = 0.6;

/**
 * Resolves the caller's transition prop into a timeline. `prefersReducedMotion` only matters when
 * `motion` is not set explicitly.
 * @param input - The `transitions` prop.
 * @param prefersReducedMotion - The OS reduced-motion setting.
 * @returns The timeline with placed phases.
 */
export function resolveTransition(
  input: TransitionsProp | undefined,
  prefersReducedMotion: boolean,
): ResolvedTransition {
  const expanded = expandTransitions(input);
  const motion: MotionMode = expanded.motion ?? (prefersReducedMotion ? 'reduced' : 'full');
  const quality = expanded.quality;

  if (motion === 'off') return emptyTimeline(motion, quality, expanded.reverseSpeed);

  const lowQuality = quality === 'low';
  let mapZoomCfg = expanded.mapZoom;
  let crossfadeCfg = expanded.crossfade;
  let flightCfg = expanded.cameraFlight;
  let sheetCfg = expanded.sheetIn;

  if (motion === 'reduced') {
    // Short fades only: no zoom, no camera flight, a brief crossfade and a short sheet.
    mapZoomCfg = false;
    flightCfg = false;
    if (crossfadeCfg)
      crossfadeCfg = {
        ...crossfadeCfg,
        duration: Math.min(crossfadeCfg.duration, REDUCED_CROSSFADE_MS),
        overlap: 0,
        blur: 0,
      };
    if (sheetCfg)
      sheetCfg = { ...sheetCfg, duration: Math.min(sheetCfg.duration, REDUCED_SHEET_MS), delay: 0 };
  }

  const phases: PhaseSpec[] = [];
  let cursor = 0;

  if (mapZoomCfg) {
    const start = mapZoomCfg.delay;
    const end = start + mapZoomCfg.duration;
    phases.push(spec('mapZoom', start, end, mapZoomCfg.duration, mapZoomCfg.ease));
    cursor = end;
  }
  if (crossfadeCfg) {
    // The crossfade starts `overlap` ms before the map zoom ends, so the two read as one move.
    const overlap = mapZoomCfg ? Math.min(crossfadeCfg.overlap, mapZoomCfg.duration) : 0;
    const start = Math.max(0, cursor - overlap) + crossfadeCfg.delay;
    const end = start + crossfadeCfg.duration;
    phases.push(spec('crossfade', start, end, crossfadeCfg.duration, crossfadeCfg.ease));
    cursor = end;
  }
  // Without a crossfade the layers swap at once, where the crossfade would have begun.
  const swapAt = crossfadeCfg ? 0 : cursor;
  if (flightCfg) {
    const start = cursor + flightCfg.delay;
    const end = start + flightCfg.duration;
    phases.push(spec('cameraFlight', start, end, flightCfg.duration, flightCfg.ease));
    cursor = end;
  }
  if (sheetCfg) {
    const start = cursor + sheetCfg.delay;
    const end = start + sheetCfg.duration;
    phases.push(spec('sheetIn', start, end, sheetCfg.duration, sheetCfg.ease));
  }

  const total = phases.reduce((max, phase) => Math.max(max, phase.end), 0);
  const blurOn = !lowQuality;
  const mapBlur = mapZoomCfg && blurOn ? clampBlur(mapZoomCfg.blur) : 0;
  const crossBlur = crossfadeCfg && blurOn ? clampBlur(crossfadeCfg.blur) : 0;

  return {
    phases,
    total,
    reverseSpeed: expanded.reverseSpeed,
    motion,
    quality,
    mapZoom: mapZoomCfg ? { maxScale: mapZoomCfg.maxScale, blur: mapBlur } : null,
    crossfade: crossfadeCfg ? { blur: crossBlur } : null,
    flight: flightCfg
      ? {
          duration: flightCfg.duration,
          ease: flightCfg.ease,
          path: flightCfg.path,
          arcHeight: flightCfg.arcHeight,
          // Only the canvas layer's blur hides the resampling, so only it lowers the resolution.
          lowResScale: crossBlur > 0 ? DEFAULT_LOW_RES_SCALE : 1,
        }
      : null,
    sheetIn: sheetCfg !== false,
    swapAt,
  };
}

function emptyTimeline(
  motion: MotionMode,
  quality: 'high' | 'low',
  reverseSpeed: number,
): ResolvedTransition {
  return {
    phases: [],
    total: 0,
    reverseSpeed,
    motion,
    quality,
    mapZoom: null,
    crossfade: null,
    flight: null,
    sheetIn: false,
    swapAt: 0,
  };
}

function spec(
  name: PhaseName,
  start: number,
  end: number,
  duration: number,
  ease: Easing | undefined,
): PhaseSpec {
  return {
    name,
    start,
    end,
    duration,
    ease: resolveEasing(ease),
    source: ease ?? 'easeInOutCubic',
  };
}

function clampBlur(value: number): number {
  return Math.min(Math.max(value, 0), MAX_BLUR);
}

/**
 * Progress of one phase at a timeline position: 0 before it, 1 after it, eased in between.
 * @param phase - The phase.
 * @param time - Timeline position in milliseconds.
 * @returns Eased progress in 0…1.
 */
export function phaseProgress(phase: PhaseSpec, time: number): number {
  if (phase.duration <= 0) return time >= phase.start ? 1 : 0;
  return phase.ease(clamp01((time - phase.start) / phase.duration));
}

/**
 * Looks a phase up by name.
 * @param resolved - The timeline.
 * @param name - Phase name.
 * @returns The phase, or `undefined` when it is skipped.
 */
export function findPhase(resolved: ResolvedTransition, name: PhaseName): PhaseSpec | undefined {
  return resolved.phases.find((phase) => phase.name === name);
}

/**
 * Boundary events crossed when the clock moves from `from` to `to`, in traversal order. A forward
 * move starts a phase at its start and ends it at its end; a backward move starts it at its end and
 * ends it at its start. Each direction includes the boundary it reaches and excludes the one it
 * leaves, so no event repeats. The map state (position 0) counts as crossed when a move leaves it
 * forward or reaches it backward, so the first phase still reports its start.
 * @param resolved - The timeline.
 * @param from - Position before the move.
 * @param to - Position after the move.
 * @returns The events in traversal order.
 */
export function phaseEvents(
  resolved: ResolvedTransition,
  from: number,
  to: number,
): TransitionEvent[] {
  if (to === from) return [];
  const forward = to > from;
  const crosses = (boundary: number): boolean =>
    forward
      ? (boundary > from && boundary <= to) || (boundary === 0 && from === 0)
      : (boundary >= to && boundary < from) ||
        (boundary === resolved.total && from === resolved.total);
  const found: { at: number; order: number; event: TransitionEvent }[] = [];
  resolved.phases.forEach((phase, order) => {
    if (forward) {
      if (crosses(phase.start))
        found.push({
          at: phase.start,
          order,
          event: { phase: phase.name, direction: 'forward', state: 'start' },
        });
      if (crosses(phase.end))
        found.push({
          at: phase.end,
          order,
          event: { phase: phase.name, direction: 'forward', state: 'end' },
        });
    } else {
      if (crosses(phase.end))
        found.push({
          at: phase.end,
          order,
          event: { phase: phase.name, direction: 'backward', state: 'start' },
        });
      if (crosses(phase.start))
        found.push({
          at: phase.start,
          order,
          event: { phase: phase.name, direction: 'backward', state: 'end' },
        });
    }
  });
  found.sort((a, b) =>
    forward ? a.at - b.at || a.order - b.order : b.at - a.at || b.order - a.order,
  );
  return found.map((item) => item.event);
}

/**
 * A reversible clock over the timeline. Pure: the caller feeds it frame deltas. Progress is a
 * function of the clock position, so reversing from any point is exact and needs no bookkeeping.
 * A gate holds a forward move at a position until the host releases it.
 */
export class TransitionClock {
  private position: number;
  private heading: Direction | null = null;
  private target: Target;
  private gateAt: number | null = null;
  private readonly total: number;
  private readonly reverseSpeed: number;

  constructor(resolved: Pick<ResolvedTransition, 'total' | 'reverseSpeed'>, initial: Target) {
    this.total = resolved.total;
    this.reverseSpeed = resolved.reverseSpeed;
    this.target = initial;
    this.position = initial === 'view' ? resolved.total : 0;
  }

  get time(): number {
    return this.position;
  }

  get goal(): Target {
    return this.target;
  }

  /** `null` when standing still. */
  get direction(): Direction | null {
    return this.heading;
  }

  /** 0 = map, 1 = view, in both directions. */
  get progress(): number {
    if (this.total <= 0) return this.target === 'view' ? 1 : 0;
    return clamp01(this.position / this.total);
  }

  /** The timeline position a forward move stops at until released, or `null`. */
  get gate(): number | null {
    return this.gateAt;
  }

  /** A forward move has reached its gate and waits for `setGate(null)`. */
  get held(): boolean {
    return this.heading === 'forward' && this.gateAt !== null && this.position >= this.gateAt;
  }

  /** Holds forward moves at `at` (`null` removes the gate). */
  setGate(at: number | null): void {
    this.gateAt = at;
  }

  /** Heads to `target`. Mid-flight it reverses from the current point. */
  goto(target: Target): void {
    this.target = target;
    if (this.total <= 0) {
      this.position = 0;
      this.heading = null;
      return;
    }
    const wanted = target === 'view' ? this.total : 0;
    if (wanted > this.position) this.heading = 'forward';
    else if (wanted < this.position) this.heading = 'backward';
    else this.heading = null;
  }

  /** Jumps to the target without animation. */
  settle(): void {
    this.position = this.target === 'view' ? this.total : 0;
    this.heading = null;
  }

  /** Moves the clock by `dtMs` of real time. Returns the position before the move. */
  advance(dtMs: number): number {
    const before = this.position;
    if (this.heading === null || dtMs <= 0 || this.held) return before;
    const rate = this.heading === 'forward' ? 1 : this.reverseSpeed;
    const wanted = this.target === 'view' ? this.total : 0;
    const step = (this.heading === 'forward' ? 1 : -1) * dtMs * rate;
    let next = this.position + step;
    if (this.heading === 'forward' && this.gateAt !== null && next >= this.gateAt) {
      this.position = Math.max(this.position, this.gateAt);
      return before;
    }
    if (
      (this.heading === 'forward' && next >= wanted) ||
      (this.heading === 'backward' && next <= wanted)
    ) {
      next = wanted;
      this.heading = null;
    }
    this.position = next;
    return before;
  }

  /** Whether the clock has reached its target. */
  get arrived(): boolean {
    return this.heading === null && this.position === (this.target === 'view' ? this.total : 0);
  }
}
