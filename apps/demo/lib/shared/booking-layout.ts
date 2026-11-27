/**
 * The layout of a hall as the booking page draws it: built with the thresholds the server checks a
 * hall with (`enforce: true`), the same way the server builds its copy. A hall file may write its own
 * balcony slab and railing sizes; with `enforce` the library keeps them within its limits, so the view
 * from a seat shows the hall the server validated and priced.
 */
import { buildHallLayout, type HallConfig, type HallLayout } from '@cinema-hall/core';

export function bookingLayout(config: HallConfig): HallLayout {
  return buildHallLayout(config, { enforce: true });
}
