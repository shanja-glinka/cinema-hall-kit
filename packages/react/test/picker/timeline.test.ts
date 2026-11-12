import { describe, expect, it } from 'vitest';
import { TransitionController } from '../../src/transitions/controller.js';
import {
  phaseEvents,
  phaseProgress,
  resolveTransition,
  TransitionClock,
  findPhase,
} from '../../src/transitions/timeline.js';

const range = (name: string, t: ReturnType<typeof resolveTransition>) => {
  const p = findPhase(t, name as 'mapZoom');
  return p ? [p.start, p.end] : null;
};

describe('presets', () => {
  it('cinematic places the phases with the documented timings and a 150 ms crossfade overlap', () => {
    const t = resolveTransition('cinematic', false);
    expect(range('mapZoom', t)).toEqual([0, 450]);
    expect(range('crossfade', t)).toEqual([300, 650]);
    expect(range('cameraFlight', t)).toEqual([650, 1850]);
    expect(range('sheetIn', t)).toEqual([1850, 2150]);
    expect(t.total).toBe(2150);
    expect(t.reverseSpeed).toBe(0.7);
    expect(t.mapZoom?.blur).toBe(12);
    expect(t.crossfade?.blur).toBe(16);
    expect(t.flight?.lowResScale).toBe(0.6);
  });

  it('subtle is shorter, blurs less and flies straight', () => {
    const t = resolveTransition('subtle', false);
    expect(t.total).toBeLessThan(resolveTransition('cinematic', false).total);
    expect(t.mapZoom?.blur).toBeLessThan(12);
    expect(t.flight?.arcHeight).toBe(0);
  });

  it('none is an instant switch', () => {
    const t = resolveTransition('none', false);
    expect(t.phases).toEqual([]);
    expect(t.total).toBe(0);
    expect(t.flight).toBeNull();
  });
});

describe('overrides', () => {
  it('false skips a phase and the rest keeps its place', () => {
    const t = resolveTransition({ cameraFlight: false }, false);
    expect(findPhase(t, 'cameraFlight')).toBeUndefined();
    expect(range('sheetIn', t)).toEqual([650, 950]);
    expect(t.flight).toBeNull();
    expect(t.sheetIn).toBe(true);
  });

  it('per-phase overrides merge with the preset', () => {
    const t = resolveTransition(
      { preset: 'cinematic', crossfade: { overlap: 0, duration: 200 } },
      false,
    );
    expect(range('crossfade', t)).toEqual([450, 650]);
    expect(t.crossfade?.blur).toBe(16);
  });

  it('quality low removes blur and keeps the camera at full resolution', () => {
    const t = resolveTransition({ quality: 'low' }, false);
    expect(t.mapZoom?.blur).toBe(0);
    expect(t.crossfade?.blur).toBe(0);
    expect(t.flight?.lowResScale).toBe(1);
  });

  it('blur above 16 px is clamped', () => {
    const t = resolveTransition({ crossfade: { blur: 40 } }, false);
    expect(t.crossfade?.blur).toBe(16);
  });
});

describe('motion', () => {
  it('reduced keeps short fades only: no zoom, no flight', () => {
    const t = resolveTransition('cinematic', true);
    expect(t.motion).toBe('reduced');
    expect(findPhase(t, 'mapZoom')).toBeUndefined();
    expect(findPhase(t, 'cameraFlight')).toBeUndefined();
    expect(t.flight).toBeNull();
    expect(findPhase(t, 'crossfade')?.duration).toBeLessThanOrEqual(150);
    expect(t.total).toBeLessThanOrEqual(300);
  });

  it('an explicit motion value wins over prefers-reduced-motion', () => {
    expect(resolveTransition({ motion: 'full' }, true).motion).toBe('full');
  });

  it('off has no timeline at all', () => {
    const t = resolveTransition({ motion: 'off' }, false);
    expect(t.total).toBe(0);
    expect(t.phases).toHaveLength(0);
  });
});

describe('clock', () => {
  it('progress runs 0 to 1 going to the view and back to 0 going to the map', () => {
    const t = resolveTransition('cinematic', false);
    const clock = new TransitionClock(t, 'map');
    expect(clock.progress).toBe(0);
    clock.goto('view');
    clock.advance(t.total / 2);
    expect(clock.progress).toBeCloseTo(0.5, 5);
    clock.advance(t.total * 2);
    expect(clock.progress).toBe(1);
    expect(clock.arrived).toBe(true);
    clock.goto('map');
    expect(clock.direction).toBe('backward');
    clock.advance(t.total * 2);
    expect(clock.progress).toBe(0);
    expect(clock.arrived).toBe(true);
  });

  it('reverse runs at reverseSpeed', () => {
    const t = resolveTransition('cinematic', false);
    const clock = new TransitionClock(t, 'view');
    clock.goto('map');
    clock.advance(1000);
    expect(clock.time).toBeCloseTo(t.total - 700, 5);
  });

  it('interrupting mid-flight reverses from the current point', () => {
    const t = resolveTransition('cinematic', false);
    const clock = new TransitionClock(t, 'map');
    clock.goto('view');
    clock.advance(1000);
    const at = clock.time;
    clock.goto('map');
    expect(clock.time).toBe(at);
    clock.advance(100);
    expect(clock.time).toBeCloseTo(at - 70, 5);
    clock.goto('view');
    expect(clock.direction).toBe('forward');
    expect(clock.time).toBeCloseTo(at - 70, 5);
  });

  it('a goal equal to the current state is a no-op', () => {
    const clock = new TransitionClock(resolveTransition('cinematic', false), 'map');
    clock.goto('map');
    expect(clock.direction).toBeNull();
  });

  it('off jumps straight to the goal', () => {
    const clock = new TransitionClock(resolveTransition({ motion: 'off' }, false), 'map');
    clock.goto('view');
    expect(clock.progress).toBe(1);
    expect(clock.direction).toBeNull();
  });
});

describe('phase progress and events', () => {
  it('eases a phase between 0 and 1 and holds the ends', () => {
    const t = resolveTransition('cinematic', false);
    const sheet = findPhase(t, 'sheetIn')!;
    expect(phaseProgress(sheet, 1000)).toBe(0);
    expect(phaseProgress(sheet, 2150)).toBe(1);
    expect(phaseProgress(sheet, 2000)).toBeCloseTo(1 - 0.5 ** 3, 5);
  });

  it('reports every boundary crossed in both directions', () => {
    const t = resolveTransition('cinematic', false);
    const forward = phaseEvents(t, 0, t.total);
    expect(forward.filter((e) => e.state === 'start').map((e) => e.phase)).toEqual([
      'mapZoom',
      'crossfade',
      'cameraFlight',
      'sheetIn',
    ]);
    expect(forward.filter((e) => e.state === 'end')).toHaveLength(4);
    const backward = phaseEvents(t, t.total, 0);
    expect(backward.every((e) => e.direction === 'backward')).toBe(true);
    expect(backward.filter((e) => e.state === 'start')).toHaveLength(4);
  });

  it('the controller drives frames, reports progress and settles', () => {
    const t = resolveTransition('cinematic', false);
    const events: string[] = [];
    let settled: string | null = null;
    const controller = new TransitionController(t, 'map', {
      schedule: () => 1,
      cancel: () => undefined,
      onEvents: (list) => events.push(...list.map((e) => `${e.phase}:${e.state}`)),
      onSettled: (target) => {
        settled = target;
      },
    });
    const seen: number[] = [];
    controller.progress.subscribe((value) => seen.push(value));
    controller.goto('view');
    controller.step(0);
    controller.step(t.total / 2);
    expect(controller.progress.get()).toBeCloseTo(0.5, 5);
    controller.step(t.total * 3);
    expect(controller.progress.get()).toBe(1);
    expect(settled).toBe('view');
    expect(events).toContain('mapZoom:end');
    expect(events).toContain('sheetIn:end');
    expect(seen[seen.length - 1]).toBe(1);
    controller.dispose();
  });
});
