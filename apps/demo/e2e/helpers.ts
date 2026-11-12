import type { APIRequestContext } from '@playwright/test';
import {
  buildHallLayout,
  parseHallConfig,
  selectionRules,
  validateSelection,
  type Occupancy,
  type SeatKey,
} from '@cinema-hall/core';

export const HALL_ID = 'orbita-hall-2';

/**
 * A seat this viewer can book right now: it is available and passes the same selection rules the
 * server runs. Computed from the public API, the way a host would.
 */
export async function pickBookableSeat(
  request: APIRequestContext,
  sessionId: string,
): Promise<SeatKey> {
  const hallResponse = await request.get(`/api/halls/${HALL_ID}`);
  const hall = (await hallResponse.json()) as { config: unknown };
  const { config } = parseHallConfig(hall.config, { strict: true });

  const occupancyResponse = await request.get(`/api/sessions/${sessionId}/occupancy`);
  const { occupancy } = (await occupancyResponse.json()) as { occupancy: Occupancy };

  const layout = buildHallLayout(config);
  const rules = [selectionRules.max(6), selectionRules.noSingleGap()];
  for (const seat of layout.seats) {
    if (validateSelection(layout, occupancy, [seat.key], rules).length === 0) return seat.key;
  }
  throw new Error(`no bookable seat in ${sessionId}`);
}
