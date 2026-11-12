import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { PerspectiveCamera } from 'three';
import { CameraRig, type CameraRigProps } from '../../src/scene/camera-rig.js';
import { fixtureLayout } from './fixtures.js';

const rig = vi.hoisted(() => ({
  invalidate: vi.fn(),
  setDpr: vi.fn(),
  frame: null as null | (() => void),
  camera: null as unknown,
  gl: null as unknown,
  dpr: 2,
}));

vi.mock('@react-three/fiber', () => ({
  useThree: () => ({
    camera: rig.camera,
    gl: rig.gl,
    invalidate: rig.invalidate,
    setDpr: rig.setDpr,
    viewport: { dpr: rig.dpr },
  }),
  useFrame: (callback: (state: { viewport: { dpr: number } }) => void) => {
    rig.frame = () => callback({ viewport: { dpr: rig.dpr } });
  },
}));

let element: HTMLDivElement;
const first = fixtureLayout.seats[0];
const second = fixtureLayout.seats[1];

function props(overrides: Partial<CameraRigProps> = {}): CameraRigProps {
  return {
    layout: fixtureLayout,
    seatKey: null,
    flight: { duration: 1000, lowResScale: 0.6 },
    interactive: true,
    gyro: false,
    yawRange: [-70, 70],
    pitchRange: [-30, 25],
    fov: 60,
    maxDpr: 2,
    controls: { current: null },
    ...overrides,
  };
}

function pointer(type: string, x: number): Event {
  const event = new Event(type);
  Object.assign(event, { pointerId: 1, clientX: x, clientY: 0 });
  return event;
}

function orientation(gamma: number, beta: number): Event {
  const event = new Event('deviceorientation');
  Object.assign(event, { gamma, beta });
  return event;
}

beforeEach(() => {
  element = document.createElement('div');
  rig.gl = { domElement: element, setPixelRatio: vi.fn(), getPixelRatio: () => 2 };
  rig.camera = new PerspectiveCamera();
  rig.dpr = 2;
  rig.invalidate.mockClear();
  rig.setDpr.mockClear();
  // Like R3F, the rig reads back the ratio it sets.
  rig.setDpr.mockImplementation((value: number) => {
    rig.dpr = value;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as unknown as { DeviceOrientationEvent?: unknown }).DeviceOrientationEvent;
});

describe('camera rig: device pixel ratio during a flight', () => {
  it('lowers the ratio through R3F state within [1, maxDpr], and restores it when the flight ends', () => {
    if (!first) throw new Error('fixture has no seats');
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    const { rerender } = render(<CameraRig {...props()} />);
    rerender(<CameraRig {...props({ seatKey: first.key })} />);
    expect(rig.setDpr).toHaveBeenLastCalledWith(1.2);

    clock.mockReturnValue(2000);
    act(() => rig.frame?.());
    expect(rig.setDpr).toHaveBeenLastCalledWith(2);
  });

  it('puts the lowered ratio back when R3F resets it during the flight', () => {
    if (!first) throw new Error('fixture has no seats');
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    const { rerender } = render(<CameraRig {...props()} />);
    rerender(<CameraRig {...props({ seatKey: first.key })} />);
    expect(rig.setDpr).toHaveBeenLastCalledWith(1.2);

    // A resize of the Canvas restores its own ratio (2) in the middle of the flight.
    rig.dpr = 2;
    clock.mockReturnValue(500);
    act(() => rig.frame?.());
    expect(rig.setDpr).toHaveBeenLastCalledWith(1.2);
    expect(rig.dpr).toBe(1.2);
  });

  it('ends at the maxDpr that holds when the flight ends, not the one it started with', () => {
    if (!first) throw new Error('fixture has no seats');
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    const { rerender } = render(<CameraRig {...props()} />);
    rerender(<CameraRig {...props({ seatKey: first.key })} />);
    rerender(<CameraRig {...props({ seatKey: first.key, maxDpr: 1 })} />);

    clock.mockReturnValue(2000);
    act(() => rig.frame?.());
    expect(rig.setDpr).toHaveBeenLastCalledWith(1);
  });
});

describe('camera rig: drags', () => {
  it('ends a drag when a flight starts, and ignores its later moves', () => {
    if (!first || !second) throw new Error('fixture has too few seats');
    const { rerender } = render(<CameraRig {...props({ seatKey: first.key })} />);
    element.dispatchEvent(pointer('pointerdown', 0));
    rig.invalidate.mockClear();
    element.dispatchEvent(pointer('pointermove', 40));
    expect(rig.invalidate).toHaveBeenCalled();

    rerender(<CameraRig {...props({ seatKey: second.key })} />);
    rig.invalidate.mockClear();
    element.dispatchEvent(pointer('pointermove', 200));
    expect(rig.invalidate).not.toHaveBeenCalled();
  });
});

describe('camera rig: gyro', () => {
  it('stops listening when the gyro option is turned off', () => {
    if (!first) throw new Error('fixture has no seats');
    const { rerender } = render(<CameraRig {...props({ seatKey: first.key, gyro: true })} />);
    element.dispatchEvent(pointer('pointerdown', 0));
    window.dispatchEvent(orientation(40, 10));
    expect(rig.invalidate).toHaveBeenCalled();

    rerender(<CameraRig {...props({ seatKey: first.key, gyro: false })} />);
    rig.invalidate.mockClear();
    window.dispatchEvent(orientation(45, 12));
    expect(rig.invalidate).not.toHaveBeenCalled();
  });

  it('attaches nothing when the permission resolves after unmount', async () => {
    if (!first) throw new Error('fixture has no seats');
    let grant: (state: string) => void = () => undefined;
    (window as unknown as { DeviceOrientationEvent: unknown }).DeviceOrientationEvent = {
      requestPermission: () =>
        new Promise<string>((resolve) => {
          grant = resolve;
        }),
    };
    const { unmount } = render(<CameraRig {...props({ seatKey: first.key, gyro: true })} />);
    element.dispatchEvent(pointer('pointerdown', 0));
    unmount();

    await act(async () => {
      grant('granted');
    });
    rig.invalidate.mockClear();
    window.dispatchEvent(orientation(40, 10));
    expect(rig.invalidate).not.toHaveBeenCalled();
  });
});
