import { describe, expect, it } from 'vitest';
import { TransitionController } from '../../src/transitions/controller.js';
import { resolveTransition } from '../../src/transitions/timeline.js';
import { sameConfig } from '../../src/transitions/compare.js';

/** A frame scheduler the test drives by hand. */
function manualFrames() {
  const queue: ((now: number) => void)[] = [];
  return {
    schedule: (frame: (now: number) => void) => queue.push(frame),
    cancel: () => {
      queue.length = 0;
    },
    run(now: number) {
      const next = queue.splice(0, queue.length);
      for (const frame of next) frame(now);
    },
    pending: () => queue.length,
  };
}

describe('TransitionController lifecycle', () => {
  it('a disposed controller emits nothing more (unmounted picker)', () => {
    const frames = manualFrames();
    const events: string[] = [];
    const controller = new TransitionController(resolveTransition('cinematic', false), 'map', {
      schedule: frames.schedule,
      cancel: frames.cancel,
      onEvents: (list) => events.push(...list.map((e) => `${e.phase}:${e.state}`)),
    });
    controller.goto('view');
    frames.run(0);
    frames.run(100);
    const before = events.length;
    controller.dispose();
    frames.run(5000);
    expect(events.length).toBe(before);
    expect(frames.pending()).toBe(0);
  });

  it('reports the forward start of the first phase at the first move', () => {
    const frames = manualFrames();
    const events: string[] = [];
    const controller = new TransitionController(resolveTransition('cinematic', false), 'map', {
      schedule: frames.schedule,
      cancel: frames.cancel,
      onEvents: (list) => events.push(...list.map((e) => `${e.phase}:${e.state}`)),
    });
    controller.goto('view');
    frames.run(0);
    frames.run(16);
    expect(events[0]).toBe('mapZoom:start');
  });

  it('holds at the gate until released, then continues and settles', () => {
    const frames = manualFrames();
    const resolved = resolveTransition('cinematic', false);
    const gate = 650;
    let held = 0;
    let settled: string | null = null;
    const controller = new TransitionController(resolved, 'map', {
      schedule: frames.schedule,
      cancel: frames.cancel,
      onHold: () => {
        held += 1;
      },
      onSettled: (target) => {
        settled = target;
      },
    });
    controller.setGate(gate);
    controller.goto('view');
    frames.run(0);
    frames.run(10_000);
    expect(controller.clock.time).toBe(gate);
    expect(controller.clock.held).toBe(true);
    expect(held).toBe(1);
    expect(frames.pending()).toBe(0);
    expect(settled).toBeNull();
    controller.release();
    // The first frame after a release has no elapsed time; the next one moves the clock.
    frames.run(20_000);
    frames.run(30_000);
    expect(settled).toBe('view');
    expect(controller.clock.arrived).toBe(true);
  });

  it('a skipped crossfade swaps the layers at one instant', () => {
    const resolved = resolveTransition({ crossfade: false }, false);
    const controller = new TransitionController(resolved, 'map');
    expect(controller.phaseValue('crossfade')).toBe(0);
    controller.goto('view');
    controller.step(0);
    controller.step(10_000);
    expect(controller.phaseValue('crossfade')).toBe(1);
  });
});

describe('sameConfig', () => {
  it('compares data by value and functions by identity', () => {
    const ease = (t: number) => t;
    expect(sameConfig({ a: { b: [1, 2] } }, { a: { b: [1, 2] } })).toBe(true);
    expect(sameConfig({ path: ease }, { path: ease })).toBe(true);
    expect(sameConfig({ path: ease }, { path: (t: number) => t })).toBe(false);
    expect(sameConfig({ duration: 1 }, { duration: 2 })).toBe(false);
  });
});

describe('instantaneous crossfade endpoint (F11)', () => {
  it('keeps the map visible at zero on both entry and return when swapAt is zero', () => {
    const frames = manualFrames();
    const controller = new TransitionController(
      resolveTransition({ mapZoom: false, crossfade: false }, false),
      'map',
      {
        schedule: frames.schedule,
        cancel: frames.cancel,
      },
    );
    expect(controller.phaseValue('crossfade')).toBe(0);
    controller.goto('view');
    expect(controller.phaseValue('crossfade')).toBe(0);
    frames.run(0);
    frames.run(16);
    expect(controller.phaseValue('crossfade')).toBe(1);
    frames.run(10_000);
    controller.goto('map');
    frames.run(20_000);
    frames.run(30_000);
    expect(controller.phaseValue('crossfade')).toBe(0);
    expect(controller.clock.arrived).toBe(true);
    controller.dispose();
  });
});
