/** Easing: a named curve, a cubic-bezier tuple or any function [0,1] → [0,1]. */
export type Easing =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'easeInOutCubic'
  | readonly [number, number, number, number]
  | ((t: number) => number);

const named: Record<
  Exclude<Easing, readonly number[] | ((t: number) => number)>,
  (t: number) => number
> = {
  linear: (t) => t,
  easeIn: (t) => t * t * t,
  easeOut: (t) => 1 - (1 - t) ** 3,
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
};

/** CSS-style cubic-bezier solved with Newton iterations (enough precision for animation). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const sample = (a1: number, a2: number, t: number) =>
    3 * a1 * t * (1 - t) ** 2 + 3 * a2 * t * t * (1 - t) + t ** 3;
  const slope = (a1: number, a2: number, t: number) =>
    3 * a1 * (1 - t) ** 2 + 6 * (a2 - a1) * t * (1 - t) + 3 * (1 - a2) * t * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const d = slope(x1, x2, t);
      if (Math.abs(d) < 1e-6) break;
      t -= (sample(x1, x2, t) - x) / d;
    }
    return sample(y1, y2, Math.min(1, Math.max(0, t)));
  };
}

/**
 * Turns any supported easing into a function of progress.
 * @param easing - a named curve, a cubic-bezier tuple or a function; `undefined` → `easeInOutCubic`.
 * @returns a function mapping time progress [0, 1] to eased progress.
 * @example resolveEasing([0.2, 0, 0, 1])(0.5) // ≈ 0.86
 */
export function resolveEasing(easing: Easing | undefined): (t: number) => number {
  if (!easing) return named.easeInOutCubic;
  if (typeof easing === 'function') return easing;
  if (typeof easing === 'string') return named[easing];
  return cubicBezier(...(easing as [number, number, number, number]));
}

/** Clamps a number to [0, 1]. */
export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
