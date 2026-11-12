import { CanvasTexture, ClampToEdgeWrapping, SRGBColorSpace, type Texture } from 'three';
import { coverFit } from './math.js';

/** The screen without a texture (no content, or a failed load): a solid, soft warm light grey. */
export const SCREEN_FALLBACK_COLOR = '#cfc6b8';

/** Width in pixels of an image drawn onto a canvas for the screen; the height follows the screen aspect. */
export const SCREEN_RASTER_WIDTH = 2048;

/**
 * The screen material. The picture is drawn as it is: the material colour is white over a texture, the screen
 * is not tone mapped, and the hall's fog does not wash it out (a screen is the picture, not a distant wall).
 * Without a texture the screen is the solid fallback colour.
 */
export function screenMaterialProps(textured: boolean): {
  color: string;
  toneMapped: boolean;
  fog: boolean;
} {
  return { color: textured ? '#ffffff' : SCREEN_FALLBACK_COLOR, toneMapped: false, fog: false };
}

/** Maps a media of the given size onto a surface of `aspect` without stretching it. */
export function fitTexture(
  texture: Texture,
  mediaWidth: number,
  mediaHeight: number,
  aspect: number,
): void {
  const { repeat, offset } = coverFit(mediaWidth, mediaHeight, aspect);
  texture.repeat.set(repeat[0], repeat[1]);
  texture.offset.set(offset[0], offset[1]);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
}

/**
 * An image with no intrinsic size (zero natural width or height, as an SVG without width and height has) cannot
 * be mapped as it is. It is drawn onto a canvas at the screen's aspect instead. Null when there is no 2D canvas
 * or the image cannot be drawn; the screen then shows its solid colour. Client only.
 */
export function rasteriseImage(image: CanvasImageSource, aspect: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const width = SCREEN_RASTER_WIDTH;
  const height = Math.max(1, Math.round(width / (aspect > 0 ? aspect : 1)));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  try {
    context.drawImage(image, 0, 0, width, height);
  } catch {
    return null;
  }
  return canvas;
}

/** A texture from a canvas, in sRGB like every colour image. */
export function canvasTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
