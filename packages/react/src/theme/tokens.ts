import type { CSSProperties } from 'react';

/**
 * Theme tokens — the single source for the `Theme` type, the CSS variables and the docs.
 *
 * Two levels:
 * - seed tokens (`accent`, `bg`, `fg`, `radius`, `font`) — enough to restyle everything;
 * - semantic/derived tokens — computed in CSS from the seeds with `color-mix()`, overridable one by
 * one.
 *
 * Public, semver-stable: every name below. Internal: variables starting with `--chk-_`.
 */

/**
 * The seed tokens: the few values that restyle the whole library. The semantic tokens are derived
 * from them in CSS with `color-mix()`, unless a semantic token is set on its own.
 */
export const SEED_TOKENS = ['accent', 'bg', 'fg', 'radius', 'font'] as const;
/** One of `SEED_TOKENS`. */
export type SeedToken = (typeof SEED_TOKENS)[number];

/**
 * Semantic tokens: named roles such as surfaces, seat states, glass effects, scene colours and
 * durations. Each can be set in `Theme.tokens`. Its CSS variable is `--chk-<name>` (see `cssVar`).
 */
export const SEMANTIC_TOKENS = [
  'on-accent',
  'fg-muted',
  'surface',
  'surface-2',
  'border',
  'inverse',
  'on-inverse',
  'danger',
  'warning',
  'seat-available',
  'seat-taken',
  'seat-held',
  'seat-blocked',
  'seat-selected',
  'radius-seat',
  /** Corner roundness of seats on the SVG map as a ratio of the seat size (0–0.5). */
  'seat-roundness',
  'radius-sheet',
  'radius-control',
  'glass-tint',
  'glass-blur',
  'glass-saturate',
  'glass-border',
  'glass-highlight',
  'glass-shadow',
  'glass-fallback',
  'scene-wall',
  'scene-floor',
  'scene-fog',
  'scene-curtain',
  'duration-fast',
  'duration-normal',
] as const;
/** One of `SEMANTIC_TOKENS`. */
export type SemanticToken = (typeof SEMANTIC_TOKENS)[number];

/** Any seed or semantic token name. */
export type TokenName = SeedToken | SemanticToken;

/**
 * Visual settings: colour scheme, token values and per-seat-type colours. Given to the `theme`
 * option of `CinemaHallOptions`. The values become CSS variables on the component root.
 */
export interface Theme {
  /** `dark` matches the concept; `auto` follows `prefers-color-scheme`. Default `dark`. */
  scheme?: 'dark' | 'light' | 'auto';
  /** Values of the seed tokens. A number for `radius` is read as pixels. */
  seed?: Partial<Record<SeedToken, string | number>>;
  /**
   * Values of the semantic tokens. A number for a radius, or for `glass-blur`, is read as pixels.
   */
  tokens?: Partial<Record<SemanticToken, string | number>>;
  /** Per seat type colours without editing the hall: `fill` on the map, `scene` in 3D. */
  seatTypes?: Record<string, { fill?: string; scene?: string }>;
}

/** CSS custom property of a token: `--chk-<name>`. */
export const cssVar = (name: TokenName) => `--chk-${name}`;

const toCssValue = (name: TokenName, value: string | number) =>
  typeof value === 'number' &&
  (name === 'radius' || name.startsWith('radius-') || name === 'glass-blur')
    ? `${value}px`
    : String(value);

/** Inline CSS variables for exactly the keys the theme sets (nothing else is overridden). */
export function themeToStyle(theme: Theme | undefined): CSSProperties {
  if (!theme) return {};
  const style: Record<string, string> = {};
  for (const [name, value] of Object.entries(theme.seed ?? {})) {
    if (value !== undefined)
      style[cssVar(name as SeedToken)] = toCssValue(name as SeedToken, value);
  }
  for (const [name, value] of Object.entries(theme.tokens ?? {})) {
    if (value !== undefined)
      style[cssVar(name as SemanticToken)] = toCssValue(name as SemanticToken, value);
  }
  return style as CSSProperties;
}

/** The same variables as a CSS rule — for strict CSP setups that forbid inline styles. */
export function themeToCss(theme: Theme, selector = '.chk-root'): string {
  const body = Object.entries(themeToStyle(theme) as Record<string, string>)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `@layer chk.skin {\n${selector} {\n${body}\n}\n}\n`;
}

/** Merges themes: later wins key by key. */
export function mergeThemes(...themes: (Theme | undefined)[]): Theme {
  const out: Theme = {};
  for (const t of themes) {
    if (!t) continue;
    if (t.scheme) out.scheme = t.scheme;
    if (t.seed) out.seed = { ...out.seed, ...t.seed };
    if (t.tokens) out.tokens = { ...out.tokens, ...t.tokens };
    if (t.seatTypes) out.seatTypes = { ...out.seatTypes, ...t.seatTypes };
  }
  return out;
}

/**
 * Ready-made themes. `cinemaDark` is the default look, and `light` is a light scheme with a blue
 * accent. Use one as the `theme` option, or spread it into a `Theme`.
 */
export const themes = {
  /** The concept's look; also the stylesheet default. */
  cinemaDark: { scheme: 'dark' } satisfies Theme,
  light: {
    scheme: 'light',
    seed: { accent: '#D9472A', bg: '#FFFFFF', fg: '#121216' },
    tokens: { 'on-accent': '#FFFFFF' },
  } satisfies Theme,
} as const;

/* -------------------------------- WebGL colours -------------------------------- */

/**
 * Colours of the 3D scene, as CSS colour strings: the accent of selected seats, the walls, the
 * floor, the fog (which is also the background colour) and the curtains.
 */
export interface SceneColors {
  accent: string;
  wall: string;
  floor: string;
  fog: string;
  curtain: string;
}

/** Scene colours of the default dark theme. */
export const DEFAULT_SCENE_COLORS: SceneColors = {
  accent: '#FF6B4A',
  wall: '#111214',
  floor: '#17181B',
  fog: '#050506',
  curtain: '#26272B',
};
