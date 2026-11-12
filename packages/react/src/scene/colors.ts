import { useEffect, useState, type RefObject } from 'react';
import { cssVar, DEFAULT_SCENE_COLORS, type SceneColors, type TokenName } from '../theme/tokens.js';

/** Fallback for `--chk-danger` (the default of the theme). */
export const DEFAULT_DANGER = '#ff6b6b';

/**
 * The scene colours, plus the `danger` colour that highlights sections. `DEFAULT_DANGER` is the
 * fallback for `danger`.
 */
export interface ResolvedColors {
  colors: SceneColors;
  danger: string;
}

/**
 * The fill a 2D canvas paints as nothing. A value the canvas rejects leaves its previous fill in
 * place, so the
 * transparent fill is what a rejected value reads back as.
 */
const TRANSPARENT_FILL = 'rgba(0, 0, 0, 0)';
/** Host attributes that can change a token: inline style, classes and the theme markers. */
const THEME_ATTRIBUTES = ['style', 'class', 'data-theme', 'data-chk-scheme'];
const DEFAULTS: ResolvedColors = { colors: DEFAULT_SCENE_COLORS, danger: DEFAULT_DANGER };

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The sRGB hex of any CSS colour (oklch(), lab(), color(display-p3 …), color-mix() …): the browser
 * paints
 * it on a 1×1 canvas and the pixel is read back. Null when the browser rejects the value, when it
 * has no
 * 2D canvas, or when the colour is fully transparent. Client only.
 */
export function paintedHex(value: string): string | null {
  if (typeof document === 'undefined') return null;
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  // The pixel decides, not the fill string: a valid colour can serialise to any string, a sentinel included.
  context.fillStyle = TRANSPARENT_FILL;
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data;
  return a === 0 ? null : toHex(r, g, b);
}

/**
 * A CSS colour value as sRGB hex: hex notation is read here, anything else goes through
 * `paintedHex`.
 */
export function readColorValue(value: string): string | null {
  if (!value) return null;
  if (value.startsWith('#')) return plainHex(value);
  return paintedHex(value);
}

/**
 * A hex colour in the form three reads: 3- and 6-digit hex as they are, 4- and 8-digit hex without
 * the alpha.
 * Any other length, or a non-hex digit, is not a colour.
 */
function plainHex(value: string): string | null {
  const digits = value.slice(1);
  if (!/^[0-9a-f]+$/i.test(digits)) return null;
  switch (digits.length) {
    case 3:
    case 6:
      return value;
    case 4:
      return `#${[...digits.slice(0, 3)].map((digit) => digit + digit).join('')}`;
    case 8:
      return `#${digits.slice(0, 6)}`;
    default:
      return null;
  }
}

/** The resolved `--chk-danger` of an element, as a hex colour. */
export function readDanger(element: Element | null): string {
  if (!element || typeof window === 'undefined') return DEFAULT_DANGER;
  const value = window.getComputedStyle(element).getPropertyValue('--chk-danger').trim();
  return readColorValue(value) ?? DEFAULT_DANGER;
}

/** The scene colours from the tokens of an element; each one falls back to its default. */
export function readSceneTokens(element: Element | null): SceneColors {
  if (!element || typeof window === 'undefined') return DEFAULT_SCENE_COLORS;
  const style = window.getComputedStyle(element);
  const read = (token: TokenName, fallback: string): string =>
    readColorValue(style.getPropertyValue(cssVar(token)).trim()) ?? fallback;
  return {
    accent: read('seat-selected', DEFAULT_SCENE_COLORS.accent),
    wall: read('scene-wall', DEFAULT_SCENE_COLORS.wall),
    floor: read('scene-floor', DEFAULT_SCENE_COLORS.floor),
    fog: read('scene-fog', DEFAULT_SCENE_COLORS.fog),
    curtain: read('scene-curtain', DEFAULT_SCENE_COLORS.curtain),
  };
}

/**
 * The root, its ancestors (across shadow roots) and the document element: any of them can set a
 * token, so a change
 * to any of them can change the resolved tokens.
 */
function hostChain(root: Element | null): Element[] {
  const chain: Element[] = [];
  let node: Element | null = root;
  while (node) {
    chain.push(node);
    node = node.parentElement ?? (node.parentNode as ShadowRoot | null)?.host ?? null;
  }
  if (!chain.includes(document.documentElement)) chain.push(document.documentElement);
  return chain;
}

function sameResolved(a: ResolvedColors, b: ResolvedColors): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Scene colours from the tokens of the root element, read after mount. They are read again when the
 * theme
 * changes, when `prefers-color-scheme` changes, and when the host changes an attribute that can
 * change a
 * token (style, class, data-theme, data-chk-scheme) on the root, on one of its ancestors or on the
 * document. Until the first read the
 * defaults are used. A changed result is a new object, which is what makes the scene redraw.
 */
export function useSceneColors(
  root: RefObject<HTMLElement | null>,
  theme: unknown,
): ResolvedColors {
  const [resolved, setResolved] = useState<ResolvedColors>(DEFAULTS);
  const themeKey = JSON.stringify(theme ?? null);
  useEffect(() => {
    const read = () => {
      const element = root.current;
      const next: ResolvedColors = {
        colors: readSceneTokens(element),
        danger: readDanger(element),
      };
      setResolved((previous) => (sameResolved(previous, next) ? previous : next));
    };
    read();
    if (typeof window === 'undefined') return;

    const observer =
      typeof MutationObserver === 'function' ? new MutationObserver(() => read()) : null;
    const options: MutationObserverInit = { attributes: true, attributeFilter: THEME_ATTRIBUTES };
    for (const element of hostChain(root.current)) observer?.observe(element, options);

    const query =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    query?.addEventListener('change', read);
    return () => {
      observer?.disconnect();
      query?.removeEventListener('change', read);
    };
  }, [root, themeKey]);
  return resolved;
}
