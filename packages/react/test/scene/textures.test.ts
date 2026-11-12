import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasTexture, SRGBColorSpace } from 'three';
import * as textures from '../../src/scene/textures.js';
import { fakeCanvas2D, useFakeContext } from './canvas-fake.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('screen material settings', () => {
  it('shows a picture as drawn: white over the texture, not tone mapped, not fogged', () => {
    expect(textures.screenMaterialProps(true)).toEqual({
      color: '#ffffff',
      toneMapped: false,
      fog: false,
    });
  });

  it('is the solid fallback colour without a picture', () => {
    expect(textures.SCREEN_FALLBACK_COLOR).toBe('#cfc6b8');
    expect(textures.screenMaterialProps(false)).toEqual({
      color: '#cfc6b8',
      toneMapped: false,
      fog: false,
    });
  });
});

describe('images without an intrinsic size', () => {
  it('are drawn onto a canvas at the screen aspect', () => {
    const context = fakeCanvas2D();
    useFakeContext(context);
    const image = {} as unknown as CanvasImageSource;
    const canvas = textures.rasteriseImage(image, 2.4);
    expect(canvas?.width).toBe(2048);
    expect(canvas?.height).toBe(853);
    expect(context.drawImage).toHaveBeenCalledWith(image, 0, 0, 2048, 853);
  });

  it('are not drawn when the image cannot be drawn', () => {
    const context = fakeCanvas2D();
    context.drawImage.mockImplementation(() => {
      throw new Error('InvalidStateError');
    });
    useFakeContext(context);
    expect(textures.rasteriseImage({} as unknown as CanvasImageSource, 2.4)).toBeNull();
  });

  it('are not drawn without a 2D context', () => {
    useFakeContext(null);
    expect(textures.rasteriseImage({} as unknown as CanvasImageSource, 2.4)).toBeNull();
  });

  it('become an sRGB canvas texture', () => {
    const canvas = document.createElement('canvas');
    const texture = textures.canvasTexture(canvas);
    expect(texture).toBeInstanceOf(CanvasTexture);
    expect(texture.colorSpace).toBe(SRGBColorSpace);
    expect(texture.image).toBe(canvas);
  });
});

describe('no gradients', () => {
  it('exports no gradient texture', () => {
    expect(Object.keys(textures)).not.toContain('createGradientTexture');
  });

  it('has no gradient code in the scene or the seat view', () => {
    const pattern =
      /createRadialGradient|createLinearGradient|CanvasGradient|-gradient\(|<linearGradient|<radialGradient/;
    for (const folder of ['../../src/scene/', '../../src/seat-view/']) {
      const directory = new URL(folder, import.meta.url);
      for (const file of readdirSync(directory)) {
        if (!/\.(ts|tsx|css)$/.test(file)) continue;
        expect(readFileSync(new URL(file, directory), 'utf8'), file).not.toMatch(pattern);
      }
    }
  });
});
