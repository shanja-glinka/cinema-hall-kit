import type { HallConfig } from './schema.js';

/**
 * A built-in starting hall. `create()` returns a new config on every call, so the caller can edit
 * the result without changing the template.
 */
export interface HallTemplate {
  /** Stable id of the template. */
  id: string;
  /** Name shown in a template picker. */
  label: string;
  /** Returns a fresh config. */
  create(): HallConfig;
}

/** Rounds up to 0.1 m so template halls leave clearance rather than cut it. */
const ceil1 = (metres: number): number => Math.ceil(metres * 10) / 10;

/**
 * Parameterised hall templates. Each call returns a new hall config that the caller can change
 * freely. The options size the hall; without them each template gives a typical hall.
 *
 * @example
 * ```ts
 * const hall = templates.threeSections({ rows: 9, seats: [4, 10, 4] });
 * ```
 */
export const templates: {
  /** Three sections (left aisle, centre, right aisle) — like the concept. */
  threeSections(opts?: {
    rows?: number;
    seats?: [number, number, number];
    aisle?: number;
  }): HallConfig;
  /** One block without aisles (small hall). */
  single(opts?: { rows?: number; seats?: number }): HallConfig;
  /** Stadium: front block + raked rear block with premium seats. */
  stadium(opts?: { frontRows?: number; rearRows?: number; seats?: number }): HallConfig;
} = {
  /**
   * Standard rows (`rows`, default 7) plus two recliner rows. Recliner row spacing is 1.2 m here,
   * not the concept's 1.15 m: with a 0.90 m recliner that keeps `rows.legroom` at its 0.30 m
   * minimum.
   */
  threeSections: (opts = {}) => {
    const standardRows = opts.rows ?? 7;
    const [left, centre, right] = opts.seats ?? [3, 8, 3];
    const aisle = opts.aisle ?? 1;
    const span = (left + centre + right) * 0.6 + 2 * aisle;
    const lastMainRow = 4.95 + (standardRows - 1) * 0.95;
    const lastRow = lastMainRow + 1.15 + 1.2;
    return {
      version: 1,
      name: 'Three-section hall',
      hall: {
        width: Math.max(14, ceil1(span + 2.5)),
        depth: Math.max(16, ceil1(lastRow + 1.5)),
        height: 8,
        wallColor: '#121316',
        floorColor: '#1A1B1E',
      },
      screen: { width: 11.5, height: 4.8, elevation: 1.2, curvature: 0 },
      seatTypes: {
        standard: { label: 'Classic', width: 0.55, depth: 0.6, color: '#5E636B' },
        recliner: { label: 'Lounge', width: 0.58, depth: 0.9, color: '#B98A8A' },
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
            defaults: {
              rows: standardRows,
              rowSpacing: 0.95,
              seatPitch: 0.6,
              seatType: 'standard',
            },
            sections: [
              { id: 'left', seatsPerRow: left },
              { id: 'centre', gapBefore: aisle, seatsPerRow: centre },
              { id: 'right', gapBefore: aisle, seatsPerRow: right },
            ],
          },
          {
            id: 'recliners',
            gapBefore: 1.15,
            riserHeight: 0.3,
            defaults: { rows: 2, rowSpacing: 1.2, seatPitch: 0.6, seatType: 'recliner' },
            sections: [
              { id: 'rec-left', seatsPerRow: left },
              { id: 'rec-centre', gapBefore: aisle, seatsPerRow: centre },
              { id: 'rec-right', gapBefore: aisle, seatsPerRow: right, color: '#C49A9A' },
            ],
          },
        ],
      },
    };
  },

  /** A single block of rows without aisles. */
  single: (opts = {}) => {
    const rows = opts.rows ?? 10;
    const seats = opts.seats ?? 12;
    const width = Math.max(8, ceil1(seats * 0.6 + 2.5));
    const lastRow = 4 + (rows - 1) * 1;
    return {
      version: 1,
      name: 'Single-block hall',
      hall: { width, depth: Math.max(8, ceil1(lastRow + 1.5)), height: 5 },
      screen: { width: ceil1(width * 0.8), height: 3, elevation: 1 },
      seatTypes: { standard: { label: 'Classic', width: 0.55, depth: 0.6, color: '#5E636B' } },
      layout: {
        firstRowDistance: 4,
        rowLabels: 'alphabetic',
        seatNumbering: 'continuous',
        eyeHeight: 1.15,
        bands: [
          {
            id: 'main',
            riserHeight: 0.2,
            defaults: { rows, rowSpacing: 1, seatPitch: 0.6, seatType: 'standard' },
            sections: [{ id: 'main', seatsPerRow: seats }],
          },
        ],
      },
    };
  },

  /** Front block of standard seats and a raked rear block of premium seats. */
  stadium: (opts = {}) => {
    const frontRows = opts.frontRows ?? 6;
    const rearRows = opts.rearRows ?? 5;
    const seats = opts.seats ?? 12;
    const width = Math.max(10, ceil1(seats * 0.65 + 2.5));
    const lastRow = 5 + (frontRows - 1) * 0.95 + 1.2 + (rearRows - 1) * 1.25;
    return {
      version: 1,
      name: 'Stadium hall',
      hall: { width, depth: Math.max(16, ceil1(lastRow + 1.5)), height: 6 },
      screen: { width: 8, height: 3.6, elevation: 1.1 },
      seatTypes: {
        standard: { label: 'Classic', width: 0.55, depth: 0.6, color: '#5E636B' },
        premium: { label: 'Premium', width: 0.6, depth: 0.9, color: '#C9A227' },
      },
      layout: {
        firstRowDistance: 5,
        rowLabels: 'alphabetic',
        seatNumbering: 'continuous',
        eyeHeight: 1.15,
        bands: [
          {
            id: 'front',
            riserHeight: 0.15,
            defaults: { rows: frontRows, rowSpacing: 0.95, seatPitch: 0.6, seatType: 'standard' },
            sections: [{ id: 'front', seatsPerRow: seats }],
          },
          {
            id: 'rear',
            gapBefore: 1.2,
            riserHeight: 0.35,
            defaults: {
              rows: rearRows,
              rowSpacing: 1.25,
              seatPitch: 0.65,
              seatType: 'premium',
              priceTier: 'premium',
            },
            sections: [{ id: 'rear', seatsPerRow: seats }],
          },
        ],
      },
    };
  },
};

/**
 * The built-in templates with their default options, in picker order. `@cinema-hall/react`
 * re-exports the same list.
 */
export const builtInTemplates: HallTemplate[] = [
  {
    id: 'threeSections',
    label: 'Three sections (concept)',
    create: () => templates.threeSections(),
  },
  { id: 'single', label: 'Single block', create: () => templates.single() },
  { id: 'stadium', label: 'Stadium', create: () => templates.stadium() },
];
