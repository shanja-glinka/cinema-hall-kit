import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { HallLayout } from '@cinema-hall/core';
import { hallAnchors } from './math.js';
import type { HallAnchors } from './types.js';

const HallAnchorsContext = createContext<HallAnchors | null>(null);

/** Provides the anchors of a layout to the React Three Fiber children of the scene. */
export function HallAnchorsProvider({
  layout,
  children,
}: {
  layout: HallLayout;
  children: ReactNode;
}): ReactNode {
  const anchors = useMemo(() => hallAnchors(layout), [layout]);
  return <HallAnchorsContext.Provider value={anchors}>{children}</HallAnchorsContext.Provider>;
}

/**
 * Positions of the screen, walls and ceiling in metres, from the layout. Call it inside the children of
 * `SeatView` or `HallPreview` (React Three Fiber children).
 */
export function useHallAnchors(): HallAnchors {
  const anchors = useContext(HallAnchorsContext);
  if (!anchors) {
    throw new Error(
      'useHallAnchors() must be called inside the children of <SeatView> or <HallPreview>.',
    );
  }
  return anchors;
}
