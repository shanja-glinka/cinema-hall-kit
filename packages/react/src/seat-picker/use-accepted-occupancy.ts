import { useState } from 'react';
import { compareRevisions, type Occupancy } from '@cinema-hall/core';

/**
 * The one occupancy snapshot the picker acts on. A snapshot is accepted only when its revision is
 * not older than the highest accepted one (core `compareRevisions` decides), also across loading gaps;
 * an older one is ignored. `undefined` input means "not loaded": the picker is inert until it arrives.
 * @param incoming - The occupancy the host passes.
 * @returns The accepted snapshot, or `undefined` while loading.
 * @example
 * ```tsx
 * const occupancy = useAcceptedOccupancy(props.occupancy);
 * const inert = occupancy === undefined;
 * ```
 */
export function useAcceptedOccupancy(incoming: Occupancy | undefined): Occupancy | undefined {
  const [accepted, setAccepted] = useState<Occupancy | undefined>(incoming);
  // Derived state, set during render (the React-documented pattern): no refs are written.
  if (incoming !== accepted) {
    if (
      incoming !== undefined &&
      (accepted === undefined || compareRevisions(incoming.revision, accepted.revision) >= 0)
    )
      setAccepted(incoming);
  }
  return incoming === undefined ? undefined : accepted;
}
