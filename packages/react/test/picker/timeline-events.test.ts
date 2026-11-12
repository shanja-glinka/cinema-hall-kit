import { describe, expect, it } from 'vitest';
import { phaseEvents, resolveTransition, TransitionClock } from '../../src/transitions/timeline.js';

describe('timeline boundaries and gate', () => {
  it('reports the forward start at 0 and the reverse end at 0', () => {
    const t = resolveTransition('cinematic', false);
    expect(phaseEvents(t, 0, 10)[0]).toEqual({
      phase: 'mapZoom',
      direction: 'forward',
      state: 'start',
    });
    const back = phaseEvents(t, 10, 0);
    expect(back[back.length - 1]).toEqual({
      phase: 'mapZoom',
      direction: 'backward',
      state: 'end',
    });
  });

  it('emits several boundaries of one tick in traversal order', () => {
    const t = resolveTransition('cinematic', false);
    const events = phaseEvents(t, 200, 700);
    expect(events.map((e) => `${e.phase}:${e.state}`)).toEqual([
      'crossfade:start',
      'mapZoom:end',
      'crossfade:end',
      'cameraFlight:start',
    ]);
  });

  it('lowResScale is 1 when the canvas layer has no blur', () => {
    expect(resolveTransition({ crossfade: { blur: 0 } }, false).flight?.lowResScale).toBe(1);
    expect(resolveTransition({ crossfade: { blur: 0 } }, false).crossfade?.blur).toBe(0);
  });

  it('the clock holds a forward move at its gate and stays held until the gate is removed', () => {
    const t = resolveTransition('cinematic', false);
    const clock = new TransitionClock(t, 'map');
    clock.setGate(100);
    clock.goto('view');
    clock.advance(1000);
    expect(clock.time).toBe(100);
    expect(clock.held).toBe(true);
    clock.advance(1000);
    expect(clock.time).toBe(100);
    clock.setGate(null);
    clock.advance(10);
    expect(clock.time).toBeCloseTo(110, 5);
  });
});

describe('reverse boundary inclusion (F15)', () => {
  it('starts the reverse camera at the boundary, once, and starts the final phase when leaving view', () => {
    const t = resolveTransition('cinematic', false);
    const event = { phase: 'cameraFlight', direction: 'backward', state: 'start' };
    expect(phaseEvents(t, 1900, 1850)).toContainEqual(event);
    expect(phaseEvents(t, 1850, 1800)).not.toContainEqual(event);
    expect(phaseEvents(t, t.total, t.total - 1)).toContainEqual({
      phase: 'sheetIn',
      direction: 'backward',
      state: 'start',
    });
    expect(phaseEvents(t, t.total - 1, t.total - 2)).toEqual([]);
  });
});
