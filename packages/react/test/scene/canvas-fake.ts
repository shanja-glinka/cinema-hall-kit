import { vi, type Mock } from 'vitest';

export interface FakeCanvas2D {
  fillStyle: string;
  fillRect: Mock;
  drawImage: Mock;
  getImageData: Mock<() => { data: Uint8ClampedArray }>;
}

type Pixel = [number, number, number, number];

/** The empty fill: a canvas paints nothing with it, and a value it rejects leaves it in place. */
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

/**
 * A 2D canvas context that records what it is asked to draw. `pixels` maps a fill value to the RGBA it paints.
 * Like a browser, a fill value it does not know (and that is not a 6-digit hex) leaves the previous fill in place,
 * and a known one reads back serialised: an opaque colour as 6-digit hex, any other as rgba().
 */
export function fakeCanvas2D(pixels: Record<string, Pixel> = {}): FakeCanvas2D {
  const known: Record<string, Pixel> = { [TRANSPARENT]: [0, 0, 0, 0], ...pixels };
  let fill = '#000000';
  return {
    get fillStyle(): string {
      return serialise(fill, known);
    },
    set fillStyle(value: string) {
      if (value in known || /^#[0-9a-f]{6}$/i.test(value)) fill = value;
    },
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => {
      const [r = 0, g = 0, b = 0, a = 255] = known[fill] ?? [0, 0, 0, 255];
      return { data: new Uint8ClampedArray([r, g, b, a]) };
    }),
  };
}

function serialise(value: string, known: Record<string, Pixel>): string {
  const pixel = known[value];
  if (!pixel) return value;
  const [r, g, b, a] = pixel;
  if (a === 255) return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  return `rgba(${r}, ${g}, ${b}, ${Number((a / 255).toFixed(3))})`;
}

/** Makes every `canvas.getContext` return the fake context, or null. */
export function useFakeContext(context: FakeCanvas2D | null): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => context) as unknown as HTMLCanvasElement['getContext'],
  );
}
