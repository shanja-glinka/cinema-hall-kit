import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { SeatKey } from '@cinema-hall/core';
import { ReadyGate } from '../../src/scene/hall-scene.js';
import type { SeatPaint } from '../../src/scene/paint.js';
import { SeatLayer } from '../../src/scene/seats.js';
import { fixtureLayout } from './fixtures.js';

const frame = vi.hoisted(() => ({
  invalidate: vi.fn(),
  tick: null as null | (() => void),
}));

vi.mock('@react-three/fiber', () => ({
  useThree: () => ({ invalidate: frame.invalidate }),
  useFrame: (callback: () => void) => {
    frame.tick = callback;
  },
}));

function tick(): void {
  act(() => frame.tick?.());
}

afterEach(() => {
  cleanup();
  frame.invalidate.mockClear();
});

describe('demand frameloop', () => {
  it('asks for a frame when seats are placed and again when their colours change', () => {
    const paint: SeatPaint = {
      accent: '#ff0000',
      danger: '#00ff00',
      selected: new Set<SeatKey>(),
      dangerSections: new Set<string>(),
      blocked: new Set<SeatKey>(),
      themeSeatColors: {},
    };
    const { rerender } = render(<SeatLayer layout={fixtureLayout} paint={paint} />);
    expect(frame.invalidate).toHaveBeenCalled();

    frame.invalidate.mockClear();
    const first = fixtureLayout.seats[0];
    if (!first) throw new Error('fixture has no seats');
    rerender(
      <SeatLayer
        layout={fixtureLayout}
        paint={{ ...paint, selected: new Set<SeatKey>([first.key]) }}
      />,
    );
    expect(frame.invalidate).toHaveBeenCalled();
  });

  it('calls onReady in the frame after the one that first sees the picture', () => {
    const readyRef = { current: false };
    const onReady = vi.fn();
    render(<ReadyGate readyRef={readyRef} onReady={onReady} />);

    tick();
    expect(onReady).not.toHaveBeenCalled();

    readyRef.current = true;
    frame.invalidate.mockClear();
    tick();
    expect(onReady).not.toHaveBeenCalled();
    expect(frame.invalidate).toHaveBeenCalled();

    tick();
    expect(onReady).toHaveBeenCalledTimes(1);
    tick();
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});
