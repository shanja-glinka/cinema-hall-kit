import {
  phaseEvents,
  phaseProgress,
  findPhase,
  TransitionClock,
  type ResolvedTransition,
  type Target,
  type TransitionEvent,
} from './timeline.js';
import type { PhaseName } from './presets.js';

/** Read-only progress handle. Public API: no motion types leak through it. */
export interface TransitionProgress {
  get(): number;
  subscribe(listener: (value: number) => void): () => void;
}

/** Callbacks and frame scheduling of a `TransitionController`. */
export interface ControllerHooks {
  /** Phase boundaries crossed during a frame, in timeline order. */
  onEvents?: (events: TransitionEvent[]) => void;
  /** Called once the clock stops (target reached). */
  onSettled?: (target: Target) => void;
  /** The clock stopped at its gate and waits for `release()`. */
  onHold?: () => void;
  /** Frame scheduler; defaults to requestAnimationFrame when it exists (never at import time). */
  schedule?: (frame: (now: number) => void) => number;
  cancel?: (handle: number) => void;
}

const defaultSchedule = (frame: (now: number) => void): number => {
  if (typeof requestAnimationFrame !== 'function') {
    return setTimeout(() => frame(Date.now()), 16) as unknown as number;
  }
  return requestAnimationFrame(frame);
};

const defaultCancel = (handle: number): void => {
  if (typeof cancelAnimationFrame !== 'function') clearTimeout(handle);
  else cancelAnimationFrame(handle);
};

/**
 * Drives one transition timeline. Overall progress is 0 on the map and 1 on the view in both
 * directions; per-phase progress is exposed for the DOM layers. Listeners are called per frame
 * and never through React state, so the layers update without re-rendering.
 *
 * Frames belong to the controller: `dispose()` cancels the pending frame and stops every event, so
 * an unmounted picker emits nothing more. `attach()` makes a disposed controller usable again
 * (React strict mode runs effects twice).
 */
export class TransitionController {
  readonly clock: TransitionClock;
  private readonly resolved: ResolvedTransition;
  private readonly hooks: ControllerHooks;
  private readonly overall = new Set<(value: number) => void>();
  private readonly perPhase = new Map<PhaseName, Set<(value: number) => void>>();
  private handle: number | null = null;
  private lastFrame: number | null = null;
  private disposed = false;

  constructor(resolved: ResolvedTransition, initial: Target, hooks: ControllerHooks = {}) {
    this.resolved = resolved;
    this.hooks = hooks;
    this.clock = new TransitionClock(resolved, initial);
  }

  /** Overall progress, 0 = map, 1 = view. */
  readonly progress: TransitionProgress = {
    get: () => this.clock.progress,
    subscribe: (listener) => this.addListener(this.overall, listener),
  };

  /** Progress of one phase in 0…1 (eased). */
  phase(name: PhaseName): TransitionProgress {
    return {
      get: () => this.phaseValue(name),
      subscribe: (listener) => {
        let set = this.perPhase.get(name);
        if (!set) {
          set = new Set();
          this.perPhase.set(name, set);
        }
        return this.addListener(set, listener);
      },
    };
  }

  phaseValue(name: PhaseName): number {
    const spec = findPhase(this.resolved, name);
    if (spec) return phaseProgress(spec, this.clock.time);
    if (this.resolved.total <= 0) return this.clock.progress;
    // A skipped crossfade swaps the layers at one instant, not over a fade.
    if (name === 'crossfade')
      return this.clock.time > 0 && this.clock.time >= this.resolved.swapAt ? 1 : 0;
    return this.clock.progress;
  }

  /** Sets the goal. A transition that is in flight reverses from the current point. */
  goto(target: Target): void {
    if (this.disposed) return;
    const before = this.clock.time;
    this.clock.goto(target);
    if (this.clock.direction === null) {
      this.clock.settle();
      this.emit(before, this.clock.time);
      this.hooks.onSettled?.(target);
      this.emitFrame();
      return;
    }
    this.start();
  }

  /** Holds forward moves at timeline position `at` (`null` removes the gate). */
  setGate(at: number | null): void {
    this.clock.setGate(at);
  }

  /** Lets a held forward move continue (the host reports that the camera has landed). */
  release(): void {
    if (this.disposed) return;
    this.clock.setGate(null);
    if (this.clock.direction !== null) this.start();
  }

  /** Runs one frame by hand (tests, or a host that owns the loop). */
  step(now: number): void {
    if (this.disposed) return;
    const dt = this.lastFrame === null ? 0 : now - this.lastFrame;
    this.lastFrame = now;
    const before = this.clock.advance(dt);
    this.emit(before, this.clock.time);
    this.emitFrame();
    if (this.disposed) return;
    if (this.clock.direction === null) {
      this.stop();
      this.hooks.onSettled?.(this.clock.goal);
      return;
    }
    if (this.clock.held) {
      this.stop();
      this.hooks.onHold?.();
      return;
    }
    this.handle = (this.hooks.schedule ?? defaultSchedule)(this.frame);
  }

  /** Cancels the pending frame. No event, frame or settle is reported afterwards. */
  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  /** Re-enables a disposed controller and resumes a move that was in flight. */
  attach(): void {
    this.disposed = false;
    if (this.clock.direction !== null && !this.clock.held) this.start();
  }

  private readonly frame = (now: number): void => {
    this.handle = null;
    this.step(now);
  };

  private start(): void {
    if (this.handle !== null) return;
    this.lastFrame = null;
    this.handle = (this.hooks.schedule ?? defaultSchedule)(this.frame);
  }

  private stop(): void {
    if (this.handle !== null) (this.hooks.cancel ?? defaultCancel)(this.handle);
    this.handle = null;
    this.lastFrame = null;
  }

  private emit(from: number, to: number): void {
    const events = phaseEvents(this.resolved, from, to);
    if (events.length > 0 && !this.disposed) this.hooks.onEvents?.(events);
  }

  private emitFrame(): void {
    const value = this.clock.progress;
    for (const listener of this.overall) listener(value);
    for (const [name, set] of this.perPhase) {
      const v = this.phaseValue(name);
      for (const listener of set) listener(v);
    }
  }

  private addListener(
    set: Set<(value: number) => void>,
    listener: (value: number) => void,
  ): () => void {
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }
}
