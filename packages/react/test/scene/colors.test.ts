import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { readColorValue, useSceneColors } from '../../src/scene/colors.js';
import { fakeCanvas2D, useFakeContext } from './canvas-fake.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('reading a CSS colour as sRGB hex', () => {
  it('uses plain hex as it is, without a canvas', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    expect(readColorValue('#abc')).toBe('#abc');
    expect(getContext).not.toHaveBeenCalled();
  });

  it('paints a modern colour (oklch) on a canvas and reads the sRGB pixel', () => {
    useFakeContext(fakeCanvas2D({ 'oklch(0.7 0.1 30)': [161, 178, 195, 255] }));
    expect(readColorValue('oklch(0.7 0.1 30)')).toBe('#a1b2c3');
  });

  it('rejects a value the browser does not parse', () => {
    useFakeContext(fakeCanvas2D());
    expect(readColorValue('not a colour')).toBeNull();
  });

  it('is null without a 2D context', () => {
    useFakeContext(null);
    expect(readColorValue('oklch(0.7 0.1 30)')).toBeNull();
  });

  it('is null for a fully transparent colour', () => {
    useFakeContext(fakeCanvas2D({ transparent: [0, 0, 0, 0] }));
    expect(readColorValue('transparent')).toBeNull();
  });

  it('reads a colour that serialises to the old sentinel', () => {
    useFakeContext(fakeCanvas2D({ 'rgb(1, 2, 3)': [1, 2, 3, 255] }));
    expect(readColorValue('rgb(1, 2, 3)')).toBe('#010203');
  });

  it('reads 4- and 8-digit hex without the alpha, and without a canvas', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    expect(readColorValue('#0f08')).toBe('#00ff00');
    expect(readColorValue('#00ff0080')).toBe('#00ff00');
    expect(getContext).not.toHaveBeenCalled();
  });

  it('rejects hex of any other length, without a canvas', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    expect(readColorValue('#ab')).toBeNull();
    expect(readColorValue('#abcde')).toBeNull();
    expect(readColorValue('#abcdef0')).toBeNull();
    expect(getContext).not.toHaveBeenCalled();
  });
});

describe('scene colours follow the host CSS', () => {
  it('re-reads the tokens when the host changes an attribute of the root', async () => {
    const tokens: Record<string, string> = { '--chk-scene-fog': '#111111' };
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () =>
        ({
          getPropertyValue: (name: string) => tokens[name] ?? '',
        }) as unknown as CSSStyleDeclaration,
    );
    const element = document.createElement('div');
    document.body.appendChild(element);
    const ref = { current: element };
    const { result } = renderHook(() => useSceneColors(ref, undefined));
    expect(result.current.colors.fog).toBe('#111111');

    tokens['--chk-scene-fog'] = '#222222';
    act(() => {
      element.setAttribute('style', '--chk-scene-fog: #222222');
    });
    await waitFor(() => expect(result.current.colors.fog).toBe('#222222'));
    element.remove();
  });

  it('re-reads the tokens when a containing panel changes its class', async () => {
    const tokens: Record<string, string> = { '--chk-scene-fog': '#111111' };
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () =>
        ({
          getPropertyValue: (name: string) => tokens[name] ?? '',
        }) as unknown as CSSStyleDeclaration,
    );
    const panel = document.createElement('section');
    const element = document.createElement('div');
    panel.appendChild(element);
    document.body.appendChild(panel);
    const ref = { current: element };
    const { result } = renderHook(() => useSceneColors(ref, undefined));
    expect(result.current.colors.fog).toBe('#111111');

    tokens['--chk-scene-fog'] = '#333333';
    act(() => {
      panel.className = 'night';
    });
    await waitFor(() => expect(result.current.colors.fog).toBe('#333333'));
    panel.remove();
  });

  it('stops reading the host when the scene unmounts', async () => {
    const getComputedStyle = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation(() => ({ getPropertyValue: () => '' }) as unknown as CSSStyleDeclaration);
    const panel = document.createElement('section');
    const element = document.createElement('div');
    panel.appendChild(element);
    document.body.appendChild(panel);
    const ref = { current: element };
    const { unmount } = renderHook(() => useSceneColors(ref, undefined));
    unmount();

    const reads = getComputedStyle.mock.calls.length;
    act(() => {
      panel.className = 'night';
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getComputedStyle.mock.calls.length).toBe(reads);
    panel.remove();
  });
});
