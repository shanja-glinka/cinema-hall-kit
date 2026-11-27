import type { HallLayout } from '@cinema-hall/core';
import { THUMB_LEVEL_TITLE, THUMB_SCREEN_THICKNESS, thumbPlan } from '@/lib/shared/thumb-plan';

/**
 * A small top-down plan of a hall: the screen on top, one rectangle per seat in its colour. A hall
 * with a balcony draws the ground floor first and then each upper level below it, under a divider
 * and the level's name, so balcony seats never cover the seats under them.
 * Plain SVG from `HallLayout` (x across the hall, z from the screen), without hooks or state, so
 * the home page renders it on the server and the upload form renders it in the browser.
 * @param props The layout to draw, a label for screen readers, the name of an upper level that no
 *   band names (given the level and how many upper levels the hall has), and the name of a band
 *   with a label as it is shown.
 * @returns The SVG plan.
 */
export function HallThumb({
  layout,
  label,
  levelName,
  bandName,
}: {
  layout: HallLayout;
  label: string;
  levelName?: (level: number, upperLevels: number) => string;
  /** The name of a labelled band as it is shown. */
  bandName?: (id: string, label: string) => string;
}) {
  const plan = thumbPlan(layout, levelName, bandName);
  const { x, y, width, height } = plan.viewBox;
  const left = x;
  const right = x + width;

  return (
    <svg
      className="hall-thumb"
      viewBox={`${x} ${y} ${width} ${height}`}
      role="img"
      aria-label={label}
      data-testid="hall-thumb"
      data-seats={layout.seats.length}
      data-levels={plan.blocks.length}
    >
      <rect
        className="hall-thumb-screen"
        x={-layout.screen.width / 2}
        y={plan.screenY - THUMB_SCREEN_THICKNESS}
        width={layout.screen.width}
        height={THUMB_SCREEN_THICKNESS}
        rx={THUMB_SCREEN_THICKNESS / 2}
      />
      {plan.blocks.map((block) => (
        <g key={block.level} data-level={block.level}>
          {block.dividerY !== null ? (
            <line
              className="hall-thumb-divider"
              x1={left + 0.3}
              x2={right - 0.3}
              y1={block.dividerY}
              y2={block.dividerY}
            />
          ) : null}
          {block.title !== null && block.titleY !== null ? (
            <text
              className="hall-thumb-level"
              x={(left + right) / 2}
              y={block.titleY}
              fontSize={THUMB_LEVEL_TITLE * 0.7}
              textAnchor="middle"
            >
              {block.title}
            </text>
          ) : null}
          {block.seats.map((seat) => {
            const type = layout.seatTypes[seat.seatTypeId];
            const seatWidth = (type?.width ?? 0.55) * 0.9;
            const seatDepth = (type?.depth ?? 0.6) * 0.8;
            const z = seat.position.z + block.offset;
            return (
              <rect
                key={seat.key}
                x={seat.position.x - seatWidth / 2}
                y={z - seatDepth / 2}
                width={seatWidth}
                height={seatDepth}
                rx={Math.min(seatWidth, seatDepth) * 0.25}
                fill={seat.color}
              />
            );
          })}
        </g>
      ))}
    </svg>
  );
}
