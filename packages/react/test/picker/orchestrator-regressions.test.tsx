import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useTransitionOrchestrator,
  LANDING_TIMEOUT_MS,
  type OrchestratorInput,
} from '../../src/seat-picker/use-transition-orchestrator.js';
import { resolveTransition } from '../../src/transitions/timeline.js';

const A = 'main.r1.s1';
const B = 'main.r1.s2';
const resolved = resolveTransition('cinematic', false);
const base: OrchestratorInput = {
  resolved,
  initialTarget: 'map',
  target: 'map',
  seatKey: null,
  webgl: true,
  onTransition: undefined,
};
function orchestrator(input: Partial<OrchestratorInput> = {}) {
  return renderHook(
    (props: Partial<OrchestratorInput>) => useTransitionOrchestrator({ ...base, ...props }),
    { initialProps: input },
  );
}
function step(hook: ReturnType<typeof orchestrator>, now: number) {
  act(() => hook.result.current.controller.step(now));
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('camera synchronization (F10, A6)', () => {
  it('scales a complete reverse camera flight by reverseSpeed immediately', () => {
    const hook = orchestrator({ initialTarget: 'view', target: 'view', seatKey: A });
    hook.rerender({ initialTarget: 'view', target: 'map', seatKey: null });
    expect(hook.result.current.cameraKey).toBeNull();
    expect(hook.result.current.flight && hook.result.current.flight.duration).toBeCloseTo(
      1200 / 0.7,
    );
    expect(hook.result.current.sheetOpen).toBe(false);
  });

  it('reverses and retargets from the current phase time, including a new seat during flight', () => {
    const hook = orchestrator();
    hook.rerender({ target: 'view', seatKey: A });
    step(hook, 0);
    step(hook, 650);
    step(hook, 950);
    expect(hook.result.current.cameraKey).toBe(A);
    const staleLanding = hook.result.current.onFlight;
    hook.rerender({ target: 'view', seatKey: B });
    expect(hook.result.current.cameraKey).toBe(B);
    expect(hook.result.current.flight && hook.result.current.flight.duration).toBeCloseTo(900);
    act(() => staleLanding({ state: 'end', progress: 1, direction: 'to-seat' }));
    expect(hook.result.current.sheetOpen).toBe(false);
    hook.rerender({ target: 'map', seatKey: null });
    expect(hook.result.current.cameraKey).toBeNull();
    expect(hook.result.current.flight && hook.result.current.flight.duration).toBeCloseTo(
      300 / 0.7,
    );
    hook.rerender({ target: 'view', seatKey: A });
    expect(hook.result.current.cameraKey).toBe(A);
    expect(hook.result.current.flight && hook.result.current.flight.duration).toBeCloseTo(900);
  });

  it('retargets a settled view with the sheet closed until the current destination lands', () => {
    const hook = orchestrator({ initialTarget: 'view', target: 'view', seatKey: A });
    const staleLanding = hook.result.current.onFlight;
    hook.rerender({ initialTarget: 'view', target: 'view', seatKey: B });
    expect(hook.result.current.cameraKey).toBe(B);
    expect(hook.result.current.sheetOpen).toBe(false);
    act(() => staleLanding({ state: 'end', progress: 1, direction: 'to-seat' }));
    expect(hook.result.current.sheetOpen).toBe(false);
    act(() => hook.result.current.onFlight({ state: 'start', progress: 0, direction: 'to-seat' }));
    act(() => hook.result.current.onFlight({ state: 'end', progress: 1, direction: 'to-seat' }));
    expect(hook.result.current.sheetOpen).toBe(true);
  });
});

describe('landing gate (F13)', () => {
  it('ignores cancelled landings and resumes after timeout without opening the sheet', () => {
    const hook = orchestrator();
    hook.rerender({ target: 'view', seatKey: A });
    step(hook, 0);
    step(hook, 650);
    step(hook, 1900);
    expect(hook.result.current.controller.clock.held).toBe(true);
    act(() => hook.result.current.onFlight({ state: 'end', progress: 0.2, direction: 'to-seat' }));
    expect(hook.result.current.controller.clock.held).toBe(true);
    expect(hook.result.current.sheetOpen).toBe(false);
    act(() => vi.advanceTimersByTime(LANDING_TIMEOUT_MS + 1));
    expect(hook.result.current.controller.clock.held).toBe(false);
    step(hook, 2200);
    step(hook, 2600);
    expect(hook.result.current.controller.clock.arrived).toBe(true);
    expect(hook.result.current.sheetOpen).toBe(false);
  });

  it('opens only after a completed current landing, or when WebGL is unavailable', () => {
    const hook = orchestrator();
    hook.rerender({ target: 'view', seatKey: A });
    step(hook, 0);
    step(hook, 650);
    step(hook, 1900);
    act(() =>
      hook.result.current.onFlight({ state: 'end', progress: 1, direction: 'to-overview' }),
    );
    expect(hook.result.current.controller.clock.held).toBe(true);
    act(() => hook.result.current.onFlight({ state: 'start', progress: 0, direction: 'to-seat' }));
    act(() => hook.result.current.onFlight({ state: 'end', progress: 1, direction: 'to-seat' }));
    expect(hook.result.current.controller.clock.held).toBe(false);
    step(hook, 2200);
    step(hook, 2600);
    expect(hook.result.current.sheetOpen).toBe(true);
    hook.unmount();
    const fallback = orchestrator({ webgl: false });
    fallback.rerender({ target: 'view', seatKey: A, webgl: false });
    step(fallback, 0);
    step(fallback, 650);
    step(fallback, 2200);
    expect(fallback.result.current.sheetOpen).toBe(true);
  });
});

/**
 * What CameraRig does when `seatKey` changes: it closes the previous flight through its NEWEST
 * callback (the end of the old flight looks like the new command's), then starts the new one.
 */
function rigRetarget(hook: ReturnType<typeof orchestrator>, oldFlightProgress: number | null) {
  const deliver = (event: Parameters<typeof hook.result.current.onFlight>[0]) =>
    act(() => hook.result.current.onFlight(event));
  if (oldFlightProgress !== null)
    deliver({ state: 'end', progress: oldFlightProgress, direction: 'to-seat' });
  deliver({ state: 'start', progress: 0, direction: 'to-seat' });
}

describe('flight identity (F13, round 4)', () => {
  it("does not take the previous flight's end, delivered through the newest callback, as the landing", () => {
    const hook = orchestrator();
    hook.rerender({ target: 'view', seatKey: A });
    step(hook, 0);
    step(hook, 650);
    step(hook, 1900);
    rigRetarget(hook, null);
    hook.rerender({ target: 'view', seatKey: B });
    expect(hook.result.current.cameraKey).toBe(B);
    // The old flight had just run out its time when the seat changed: progress 1, direction to-seat.
    act(() => hook.result.current.onFlight({ state: 'end', progress: 1, direction: 'to-seat' }));
    expect(hook.result.current.sheetOpen).toBe(false);
    expect(hook.result.current.controller.clock.held).toBe(true);
    act(() => hook.result.current.onFlight({ state: 'start', progress: 0, direction: 'to-seat' }));
    // B is half way: its own interrupted end is not a landing either.
    act(() => hook.result.current.onFlight({ state: 'end', progress: 0.5, direction: 'to-seat' }));
    expect(hook.result.current.sheetOpen).toBe(false);
    expect(hook.result.current.controller.clock.held).toBe(true);
    rigRetarget(hook, null);
    act(() => hook.result.current.onFlight({ state: 'end', progress: 1, direction: 'to-seat' }));
    expect(hook.result.current.controller.clock.held).toBe(false);
    step(hook, 2300);
    step(hook, 2700);
    expect(hook.result.current.sheetOpen).toBe(true);
  });
});

describe('a Canvas that mounts after the command (F46)', () => {
  it('treats readiness as the landing when the rig starts at the seat and emits no flight events', () => {
    const hook = orchestrator();
    hook.rerender({ target: 'view', seatKey: A });
    step(hook, 0);
    step(hook, 650);
    step(hook, 1900);
    expect(hook.result.current.controller.clock.held).toBe(true);
    // The real rig initialised at the seat: no start, no end, only onReady.
    act(() => hook.result.current.onReady(true));
    expect(hook.result.current.controller.clock.held).toBe(false);
    step(hook, 2300);
    step(hook, 2700);
    expect(hook.result.current.sheetOpen).toBe(true);
  });
  it('lands at once when readiness arrives after the clock already reached the end', () => {
    const hook = orchestrator({ webgl: true });
    hook.rerender({ target: 'view', seatKey: A });
    step(hook, 0);
    step(hook, 650);
    step(hook, 1900);
    act(() => vi.advanceTimersByTime(LANDING_TIMEOUT_MS + 1));
    step(hook, 2300);
    step(hook, 2700);
    expect(hook.result.current.controller.clock.arrived).toBe(true);
    expect(hook.result.current.sheetOpen).toBe(false);
    act(() => hook.result.current.onReady(true));
    expect(hook.result.current.sheetOpen).toBe(true);
  });
  it('ignores readiness on the map and for a destination that was not commanded yet', () => {
    const hook = orchestrator();
    act(() => hook.result.current.onReady(true));
    expect(hook.result.current.sheetOpen).toBe(false);
  });
});

describe('sheet timing (F12)', () => {
  it('preserves the instant first open through initial settlement', () => {
    const hook = orchestrator({ initialTarget: 'view', target: 'view', seatKey: A });
    expect(hook.result.current.sheetOpen).toBe(true);
    expect(hook.result.current.sheetInstant).toBe(true);
  });
  it.each(['none', { sheetIn: false }] as const)(
    'skipped sheet phases stay instant (%s)',
    (config) => {
      const hook = orchestrator({ resolved: resolveTransition(config, false) });
      expect(hook.result.current.sheetInstant).toBe(true);
    },
  );
  it('passes a custom sheet easing function unchanged', () => {
    const ease = (t: number) => t * t;
    const hook = orchestrator({ resolved: resolveTransition({ sheetIn: { ease } }, false) });
    expect(hook.result.current.sheetTween?.ease).toBe(ease);
    expect(
      typeof hook.result.current.sheetTween?.ease === 'function' &&
        hook.result.current.sheetTween.ease(0.5),
    ).toBe(0.25);
  });
});

describe('camera readiness and immediate phase entry', () => {
  it('mounts overview first when cameraFlight starts at zero (F11, F13)', () => {
    const resolved = resolveTransition({ mapZoom: false, crossfade: false }, false);
    const hook = orchestrator({ resolved });
    hook.rerender({ resolved, target: 'view', seatKey: A });
    expect(hook.result.current.viewMounted).toBe(true);
    expect(hook.result.current.cameraKey).toBeNull();
    step(hook, 0);
    step(hook, 16);
    expect(hook.result.current.cameraKey).toBe(A);
  });
  it('releases readiness only for a missing Canvas, and leaves cancellation closed otherwise (F13)', () => {
    const hook = orchestrator();
    hook.rerender({ target: 'view', seatKey: A });
    step(hook, 0);
    step(hook, 650);
    step(hook, 1900);
    // The camera flight of the current command is running: readiness is not a landing.
    act(() => hook.result.current.onFlight({ state: 'start', progress: 0, direction: 'to-seat' }));
    act(() => hook.result.current.onReady(true));
    expect(hook.result.current.controller.clock.held).toBe(true);
    act(() => hook.result.current.onReady(false));
    expect(hook.result.current.controller.clock.held).toBe(false);
    step(hook, 2200);
    step(hook, 2600);
    expect(hook.result.current.sheetOpen).toBe(true);
  });
});
