import { buildHallLayout, type HallConfig, type HallLayout } from '@cinema-hall/core';

/** A small hall: 37 seats (33 standard in three rows, 4 recliners behind), a curved screen. */
export const fixtureConfig: HallConfig = {
  version: 1,
  name: 'Fixture',
  hall: { width: 14, depth: 16, height: 8 },
  screen: { width: 11.5, height: 4.8, elevation: 1.2, curvature: 0.4 },
  seatTypes: {
    standard: { label: 'Standard', width: 0.55, depth: 0.6, color: '#A3160F' },
    recliner: { label: 'Recliner', width: 0.58, depth: 0.9, color: '#7A1A14' },
  },
  layout: {
    firstRowDistance: 4.95,
    rowLabels: 'alphabetic',
    seatNumbering: 'continuous',
    eyeHeight: 1.15,
    bands: [
      {
        id: 'main',
        riserHeight: 0.15,
        defaults: { rows: 3, rowSpacing: 0.95, seatPitch: 0.6, seatType: 'standard' },
        sections: [
          { id: 'left', seatsPerRow: 3 },
          { id: 'centre', gapBefore: 1, seatsPerRow: 8 },
        ],
      },
      {
        id: 'recliners',
        gapBefore: 1.15,
        riserHeight: 0.3,
        defaults: { rows: 1, rowSpacing: 1.15, seatPitch: 0.6, seatType: 'recliner' },
        sections: [{ id: 'rec', seatsPerRow: 4 }],
      },
    ],
  },
};

export const fixtureLayout: HallLayout = buildHallLayout(fixtureConfig);
