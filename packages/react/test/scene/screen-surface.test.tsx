import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ScreenSurface } from '../../src/scene/screen.js';
import { fixtureLayout } from './fixtures.js';

const frame = vi.hoisted(() => ({
  invalidate: vi.fn(),
  media: { texture: null, video: null, ready: false },
}));

vi.mock('@react-three/fiber', () => ({
  useThree: () => ({ invalidate: frame.invalidate }),
  useFrame: () => undefined,
}));

vi.mock('three/examples/jsm/lights/RectAreaLightUniformsLib.js', () => ({
  RectAreaLightUniformsLib: { init: () => undefined },
}));

vi.mock('../../src/scene/use-screen-media.js', () => ({
  useScreenMedia: () => frame.media,
}));

beforeAll(() => {
  // The area light's target is set with `lookAt`; react-dom draws the light as a plain element, which has none.
  Object.defineProperty(HTMLElement.prototype, 'lookAt', {
    value: () => undefined,
    configurable: true,
  });
});

afterAll(() => {
  delete (HTMLElement.prototype as unknown as { lookAt?: unknown }).lookAt;
});

afterEach(() => {
  cleanup();
  frame.invalidate.mockClear();
  frame.media = { texture: null, video: null, ready: false };
});

describe('screen frames', () => {
  it('asks for a frame when the screen settles without a picture', () => {
    const { rerender } = render(
      <ScreenSurface screen={fixtureLayout.screen} onSettled={vi.fn()} />,
    );
    frame.invalidate.mockClear();

    // A failed image: no texture, but the screen is ready. The readiness must bring a frame, or onReady never fires.
    frame.media = { texture: null, video: null, ready: true };
    rerender(<ScreenSurface screen={fixtureLayout.screen} onSettled={vi.fn()} />);
    expect(frame.invalidate).toHaveBeenCalled();
  });
});
