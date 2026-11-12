import { Color } from 'three';
import type { Seat, SeatKey } from '@cinema-hall/core';
import type { Theme } from '../theme/tokens.js';

/** Everything that decides a seat's colour in the scene. */
export interface SeatPaint {
  /** Colour of selected / highlighted seats. */
  accent: string;
  /** Colour of seats in a highlighted section. */
  danger: string;
  selected: ReadonlySet<SeatKey>;
  dangerSections: ReadonlySet<string>;
  blocked: ReadonlySet<SeatKey>;
  /** `theme.seatTypes[id].scene`, by seat type id. */
  themeSeatColors: Readonly<Record<string, string | undefined>>;
}

/** Blocked seats are drawn at this fraction of their colour. */
export const BLOCKED_FACTOR = 0.35;

/**
 * Colour of one seat. Order: selected, danger section, theme or data colour (darkened when
 * blocked).
 */
export function seatColor(seat: Seat, paint: SeatPaint, out: Color = new Color()): Color {
  if (paint.selected.has(seat.key)) return out.set(paint.accent);
  if (paint.dangerSections.has(seat.sectionId)) return out.set(paint.danger);
  out.set(paint.themeSeatColors[seat.seatTypeId] ?? seat.color);
  if (paint.blocked.has(seat.key)) out.multiplyScalar(BLOCKED_FACTOR);
  return out;
}

/**
 * The scene colours that the theme's seat types set (`scene`), by seat type id. Seat types without
 * a `scene` colour are left out.
 */
export function seatTypeColors(theme: Theme): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const [id, value] of Object.entries(theme.seatTypes ?? {})) {
    if (value.scene) colors[id] = value.scene;
  }
  return colors;
}
