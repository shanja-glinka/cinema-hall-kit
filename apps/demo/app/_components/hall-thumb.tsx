import type { HallLayout } from '@cinema-hall/core';

const PAD = 0.7;
const SCREEN_GAP = 0.9;
const SCREEN_THICKNESS = 0.3;

/**
 * A small top-down plan of a hall: the screen on top, one rectangle per seat in its colour.
 * Plain SVG from `HallLayout` (x across the hall, z from the screen), without hooks or state, so
 * the home page renders it on the server and the upload form renders it in the browser.
 * @param props The layout to draw and a label for screen readers.
 * @returns The SVG plan.
 */
export function HallThumb({ layout, label }: { layout: HallLayout; label: string }) {
  let minX = -layout.screen.width / 2;
  let maxX = layout.screen.width / 2;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const seat of layout.seats) {
    const type = layout.seatTypes[seat.seatTypeId];
    const halfWidth = (type?.width ?? 0.55) / 2;
    const halfDepth = (type?.depth ?? 0.6) / 2;
    minX = Math.min(minX, seat.position.x - halfWidth);
    maxX = Math.max(maxX, seat.position.x + halfWidth);
    minZ = Math.min(minZ, seat.position.z - halfDepth);
    maxZ = Math.max(maxZ, seat.position.z + halfDepth);
  }
  if (!Number.isFinite(minZ)) {
    minZ = 0;
    maxZ = 1;
  }
  const screenZ = minZ - SCREEN_GAP;
  const x = minX - PAD;
  const y = screenZ - SCREEN_THICKNESS - PAD;
  const width = maxX - minX + 2 * PAD;
  const height = maxZ - y + PAD;

  return (
    <svg
      className="hall-thumb"
      viewBox={`${x} ${y} ${width} ${height}`}
      role="img"
      aria-label={label}
      data-testid="hall-thumb"
      data-seats={layout.seats.length}
    >
      <rect
        className="hall-thumb-screen"
        x={-layout.screen.width / 2}
        y={screenZ - SCREEN_THICKNESS}
        width={layout.screen.width}
        height={SCREEN_THICKNESS}
        rx={SCREEN_THICKNESS / 2}
      />
      {layout.seats.map((seat) => {
        const type = layout.seatTypes[seat.seatTypeId];
        const seatWidth = (type?.width ?? 0.55) * 0.9;
        const seatDepth = (type?.depth ?? 0.6) * 0.8;
        return (
          <rect
            key={seat.key}
            x={seat.position.x - seatWidth / 2}
            y={seat.position.z - seatDepth / 2}
            width={seatWidth}
            height={seatDepth}
            rx={Math.min(seatWidth, seatDepth) * 0.25}
            fill={seat.color}
          />
        );
      })}
    </svg>
  );
}
