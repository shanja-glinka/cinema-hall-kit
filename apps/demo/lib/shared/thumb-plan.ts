/**
 * Geometry of the small hall plan on the home page and the import page (`HallThumb`). A hall with
 * a balcony has seats above other seats; drawn on one plan they cover each other. So, like the
 * booking seat map, the plan draws the ground floor under the screen and then each upper level
 * below it, after a gap with the level's name. Pure: no React, safe on the server and the client.
 */
import type { HallLayout, Seat } from '@cinema-hall/core';

/** Empty space around the seats, metres. */
export const THUMB_PAD = 0.7;
/** Space between the screen and the first row, metres. */
export const THUMB_SCREEN_GAP = 0.9;
/** Thickness of the screen bar, metres. */
export const THUMB_SCREEN_THICKNESS = 0.3;
/** Space between two levels, metres: a divider in its middle. */
export const THUMB_LEVEL_GAP = 0.8;
/** Height of the line with an upper level's name, metres. */
export const THUMB_LEVEL_TITLE = 1.3;

/** The seats of one level, moved along the plan so that levels do not overlap. */
export interface ThumbBlock {
  /** 0 for the ground floor, 1 and up for a balcony (`Seat.level`). */
  level: number;
  /** Name drawn above the level; `null` for the ground floor. */
  title: string | null;
  /** Where the divider line above the level is drawn; `null` for the first block. */
  dividerY: number | null;
  /** Baseline of the title; `null` without a title. */
  titleY: number | null;
  /** Added to a seat's `position.z` to draw it. */
  offset: number;
  seats: Seat[];
}

/** Everything `HallThumb` needs to draw: the view box, the screen and the blocks of seats. */
export interface ThumbPlan {
  viewBox: { x: number; y: number; width: number; height: number };
  /** Plan Y of the screen's front edge. */
  screenY: number;
  blocks: ThumbBlock[];
}

/**
 * Lays out the plan of a hall.
 * @param layout The hall's layout.
 * @param levelName Name of an upper level that no band names, given the level and how many upper
 *   levels the hall has (`Balcony` when it has one).
 * @param bandName The name of a band with a label, as shown (sample texts).
 * @returns The view box, the screen position and one block per level, ground floor first.
 */
export function thumbPlan(
  layout: HallLayout,
  levelName: (level: number, upperLevels: number) => string = (level) => `Level ${level + 1}`,
  bandName: (id: string, label: string) => string = (_id, label) => label,
): ThumbPlan {
  const size = (seat: Seat) => {
    const type = layout.seatTypes[seat.seatTypeId];
    return { halfWidth: (type?.width ?? 0.55) / 2, halfDepth: (type?.depth ?? 0.6) / 2 };
  };
  const byLevel = new Map<number, Seat[]>();
  for (const seat of layout.seats) {
    const level = seat.level ?? 0;
    const list = byLevel.get(level);
    if (list) list.push(seat);
    else byLevel.set(level, [seat]);
  }
  const levels = [...byLevel.keys()].sort((a, b) => a - b);
  const upperLevels = levels.filter((level) => level > 0).length;

  let minX = -layout.screen.width / 2;
  let maxX = layout.screen.width / 2;
  for (const seat of layout.seats) {
    const { halfWidth } = size(seat);
    minX = Math.min(minX, seat.position.x - halfWidth);
    maxX = Math.max(maxX, seat.position.x + halfWidth);
  }

  const blocks: ThumbBlock[] = [];
  let firstTop = 0;
  let bottom = 1;
  levels.forEach((level, index) => {
    const seats = byLevel.get(level)!;
    let top = Infinity;
    let end = -Infinity;
    for (const seat of seats) {
      const { halfDepth } = size(seat);
      top = Math.min(top, seat.position.z - halfDepth);
      end = Math.max(end, seat.position.z + halfDepth);
    }
    if (index === 0) {
      firstTop = top;
      blocks.push({ level, title: null, dividerY: null, titleY: null, offset: 0, seats });
      bottom = end;
      return;
    }
    const names = (layout.bands ?? [])
      .filter((band) => band.level === level && band.label)
      .map((band) => bandName(band.id, band.label!));
    const title = names.length > 0 ? names.join(' · ') : levelName(level, upperLevels);
    const dividerY = bottom + THUMB_LEVEL_GAP / 2;
    const titleY = bottom + THUMB_LEVEL_GAP + THUMB_LEVEL_TITLE * 0.75;
    const offset = bottom + THUMB_LEVEL_GAP + THUMB_LEVEL_TITLE - top;
    blocks.push({ level, title, dividerY, titleY, offset, seats });
    bottom = end + offset;
  });

  const screenY = (blocks.length > 0 ? firstTop : 0) - THUMB_SCREEN_GAP;
  const y = screenY - THUMB_SCREEN_THICKNESS - THUMB_PAD;
  return {
    viewBox: {
      x: minX - THUMB_PAD,
      y,
      width: maxX - minX + 2 * THUMB_PAD,
      height: bottom - y + THUMB_PAD,
    },
    screenY,
    blocks,
  };
}
