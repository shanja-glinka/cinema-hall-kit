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

/**
 * Two seats this viewer can book right now, together and the first one on its own, under the same
 * selection rules the server runs.
 */
export async function pickBookablePair(
  request: APIRequestContext,
  sessionId: string,
): Promise<[SeatKey, SeatKey]> {
  const hallResponse = await request.get(`/api/halls/${HALL_ID}`);
  const hall = (await hallResponse.json()) as { config: unknown };
  const { config } = parseHallConfig(hall.config, { strict: true });

  const occupancyResponse = await request.get(`/api/sessions/${sessionId}/occupancy`);
  const { occupancy } = (await occupancyResponse.json()) as { occupancy: Occupancy };

  const layout = buildHallLayout(config);
  const rules = [selectionRules.max(6), selectionRules.noSingleGap()];
  const ok = (keys: SeatKey[]) => validateSelection(layout, occupancy, keys, rules).length === 0;
  for (const first of layout.seats) {
    if (!ok([first.key])) continue;
    for (const second of layout.seats) {
      if (second.key !== first.key && ok([first.key, second.key])) return [first.key, second.key];
    }
  }
  throw new Error(`no bookable pair of seats in ${sessionId}`);
}
