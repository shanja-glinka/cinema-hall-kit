import type { HallConfig, PricingConfig } from './schema.js';

/**
 * The human-readable texts a built-in template writes into the config: the hall name, the seat
 * type labels and the band labels. Ids (seat type ids, band ids, section ids) never change with
 * the texts.
 */
export interface TemplateTexts {
  /** Hall name of each template. */
  names: { threeSections: string; single: string; stadium: string; balcony: string };
  /** Label of each seat type the templates use, by seat type id. */
  seatTypes: { standard: string; recliner: string; premium: string; balcony: string };
  /** Label of each band the templates use, by band id. */
  bands: {
    main: string;
    stalls: string;
    recliners: string;
    front: string;
    rear: string;
    balcony: string;
  };
}

/** Text options of every template: texts that replace some of its built-in texts. */
export interface TemplateOptions {
  /** Texts that replace the built-in texts (`templateTexts`), one by one, for your own wording. */
  texts?: {
    names?: Partial<TemplateTexts['names']>;
    seatTypes?: Partial<TemplateTexts['seatTypes']>;
    bands?: Partial<TemplateTexts['bands']>;
  };
}

/** The built-in texts of the templates. */
export const templateTexts: TemplateTexts = {
  names: {
    threeSections: 'Three-section hall',
    single: 'Single-block hall',
    stadium: 'Stadium hall',
    balcony: 'Two-level hall',
  },
  seatTypes: { standard: 'Classic', recliner: 'Lounge', premium: 'Premium', balcony: 'Balcony' },
  bands: {
    main: 'Stalls',
    stalls: 'Stalls',
    recliners: 'Recliners',
    front: 'Front rows',
    rear: 'Premium rows',
    balcony: 'Balcony',
  },
};

/**
 * Base price of each seat type of the templates, in plain units without currency. Every template
 * prices every seat type it uses, so a new hall can be booked right away.
 */
export const templatePrices = {
  standard: 450,
  recliner: 650,
  premium: 650,
  balcony: 380,
} as const satisfies Record<keyof TemplateTexts['seatTypes'], number>;

/** The texts for `options`: the built-in texts with the overrides applied. */
function textsFor(options: TemplateOptions = {}): TemplateTexts {
  const base = templateTexts;
  return {
    names: { ...base.names, ...options.texts?.names },
    seatTypes: { ...base.seatTypes, ...options.texts?.seatTypes },
    bands: { ...base.bands, ...options.texts?.bands },
  };
}

/** A pricing block with the template price of each of `seatTypes`. */
function pricingFor(...seatTypes: (keyof typeof templatePrices)[]): PricingConfig {
  return { tiers: Object.fromEntries(seatTypes.map((id) => [id, templatePrices[id]])) };
}

/**
 * A built-in starting hall. `create()` returns a new config on every call, so the caller can edit
 * the result without changing the template.
 */
export interface HallTemplate {
  /** Stable id of the template. */
  id: string;
  /** Name shown in a template picker. */
  label: string;
  /**
   * Returns a fresh config. The built-in templates accept `TemplateOptions` (`{ texts }`) to
   * replace the hall name and labels; other templates may ignore the argument.
   */
  create(options?: TemplateOptions): HallConfig;
}

/** Rounds up to 0.1 m so template halls leave clearance rather than cut it. */
const ceil1 = (metres: number): number => Math.ceil(metres * 10) / 10;

/** Eye height and minimum headroom the templates plan their ceilings with (the defaults). */
const TEMPLATE_EYE_HEIGHT = 1.15;
const TEMPLATE_HEADROOM = 0.5;

/**
 * The hall height of a template: `base`, or more when the back row's eye plus the minimum headroom
 * needs it. `backFloor` is the floor height of the back row (every row after the first of the
 * hall rises by its band's riser), so a template with many rows stays within the ceiling.
 */
const ceilingFor = (base: number, backFloor: number): number =>
  Math.max(base, ceil1(backFloor + TEMPLATE_EYE_HEIGHT + TEMPLATE_HEADROOM));

/** Geometry of the `balcony` template. */
const STALLS_RISER = 0.25;
const RECLINER_RISER = 0.35;
const BALCONY_ELEVATION = 4.5;
const BALCONY_RISER = 0.6;

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
  threeSections(
    opts?: TemplateOptions & {
      rows?: number;
      seats?: [number, number, number];
      aisle?: number;
    },
  ): HallConfig;
  /** One block without aisles (small hall). */
  single(opts?: TemplateOptions & { rows?: number; seats?: number }): HallConfig;
  /** Stadium: front block + raked rear block with premium seats. */
  stadium(
    opts?: TemplateOptions & { frontRows?: number; rearRows?: number; seats?: number },
  ): HallConfig;
  /**
   * Two levels: raked stalls (three sections, two aisles, two recliner rows at the back) and a
   * balcony that hangs over the rear of the stalls. 240 seats.
   */
  balcony(opts?: TemplateOptions): HallConfig;
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
    const lastMainRow = 6 + (standardRows - 1) * 0.95;
    const lastRow = lastMainRow + 1.15 + 1.2;
    const t = textsFor(opts);
    return {
      version: 1,
      name: t.names.threeSections,
      hall: {
        width: Math.max(14, ceil1(span + 2.5)),
        depth: Math.max(16, ceil1(lastRow + 1.5)),
        height: ceilingFor(8, (standardRows - 1) * 0.25 + 2 * 0.35),
        wallColor: '#121316',
        floorColor: '#1A1B1E',
      },
      screen: { width: 11.5, height: 4.8, elevation: 1.2, curvature: 0 },
      seatTypes: {
        standard: { label: t.seatTypes.standard, width: 0.55, depth: 0.6, color: '#5E636B' },
        recliner: { label: t.seatTypes.recliner, width: 0.58, depth: 0.9, color: '#B98A8A' },
      },
      pricing: pricingFor('standard', 'recliner'),
      layout: {
        firstRowDistance: 6,
        rowLabels: 'alphabetic',
        seatNumbering: 'continuous',
        eyeHeight: 1.15,
        bands: [
          {
            id: 'main',
            label: t.bands.main,
            riserHeight: 0.25,
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
            label: t.bands.recliners,
            gapBefore: 1.15,
            riserHeight: 0.35,
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
    const lastRow = 5 + (rows - 1) * 1;
    const t = textsFor(opts);
    return {
      version: 1,
      name: t.names.single,
      hall: {
        width,
        depth: Math.max(8, ceil1(lastRow + 1.5)),
        height: ceilingFor(5, (rows - 1) * 0.3),
      },
      screen: { width: ceil1(width * 0.8), height: 3, elevation: 1.5 },
      seatTypes: {
        standard: { label: t.seatTypes.standard, width: 0.55, depth: 0.6, color: '#5E636B' },
      },
      pricing: pricingFor('standard'),
      layout: {
        firstRowDistance: 5,
        rowLabels: 'alphabetic',
        seatNumbering: 'continuous',
        eyeHeight: 1.15,
        bands: [
          {
            id: 'main',
            label: t.bands.main,
            riserHeight: 0.3,
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
    const t = textsFor(opts);
    return {
      version: 1,
      name: t.names.stadium,
      hall: {
        width,
        depth: Math.max(16, ceil1(lastRow + 1.5)),
        height: ceilingFor(6, (frontRows - 1) * 0.25 + rearRows * 0.35),
      },
      screen: { width: 8, height: 3.6, elevation: 1.3 },
      seatTypes: {
        standard: { label: t.seatTypes.standard, width: 0.55, depth: 0.6, color: '#5E636B' },
        premium: { label: t.seatTypes.premium, width: 0.6, depth: 0.9, color: '#C9A227' },
      },
      pricing: pricingFor('standard', 'premium'),
      layout: {
        firstRowDistance: 5,
        rowLabels: 'alphabetic',
        seatNumbering: 'continuous',
        eyeHeight: 1.15,
        bands: [
          {
            id: 'front',
            label: t.bands.front,
            riserHeight: 0.25,
            defaults: { rows: frontRows, rowSpacing: 0.95, seatPitch: 0.6, seatType: 'standard' },
            sections: [{ id: 'front', seatsPerRow: seats }],
          },
          {
            id: 'rear',
            label: t.bands.rear,
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

  /**
   * Stalls of 7 standard rows (5 + 12 + 5 seats) and 2 recliner rows, then a balcony of 3 rows of
   * 14 seats. The balcony sets `startDistance` and `elevation`, so it sits above the last stalls
   * row and the recliners with headroom under it and a clear view of the screen from every row.
   */
  balcony: (opts = {}) => {
    const t = textsFor(opts);
    return {
      version: 1,
      name: t.names.balcony,
      hall: { width: 18, depth: 16, height: 8, wallColor: '#121316', floorColor: '#1A1B1E' },
      screen: { width: 12, height: 4.8, elevation: 1.2, curvature: 0 },
      seatTypes: {
        standard: { label: t.seatTypes.standard, width: 0.55, depth: 0.6, color: '#5E636B' },
        recliner: { label: t.seatTypes.recliner, width: 0.58, depth: 0.9, color: '#B98A8A' },
        balcony: { label: t.seatTypes.balcony, width: 0.55, depth: 0.6, color: '#7C8FA6' },
      },
      pricing: pricingFor('standard', 'recliner', 'balcony'),
      layout: {
        firstRowDistance: 6,
        rowLabels: 'alphabetic',
        seatNumbering: 'continuous',
        eyeHeight: 1.15,
        bands: [
          {
            id: 'stalls',
            label: t.bands.stalls,
            riserHeight: STALLS_RISER,
            defaults: { rows: 7, rowSpacing: 0.95, seatPitch: 0.6, seatType: 'standard' },
            sections: [
              { id: 'left', seatsPerRow: 5 },
              { id: 'centre', gapBefore: 1, seatsPerRow: 12 },
              { id: 'right', gapBefore: 1, seatsPerRow: 5 },
            ],
          },
          {
            id: 'recliners',
            label: t.bands.recliners,
            gapBefore: 1.2,
            riserHeight: RECLINER_RISER,
            defaults: { rows: 2, rowSpacing: 1.2, seatPitch: 0.6, seatType: 'recliner' },
            sections: [
              { id: 'rec-left', seatsPerRow: 5 },
              { id: 'rec-centre', gapBefore: 1, seatsPerRow: 12 },
              { id: 'rec-right', gapBefore: 1, seatsPerRow: 5 },
            ],
          },
          {
            id: 'balcony',
            label: t.bands.balcony,
            // The first balcony row's slab ends 5 cm in front of the recliner seats, so their bodies stay
            // under the higher second step.
            startDistance: 11.9,
            elevation: BALCONY_ELEVATION,
            riserHeight: BALCONY_RISER,
            defaults: { rows: 3, rowSpacing: 1, seatPitch: 0.6, seatType: 'balcony' },
            sections: [{ id: 'balcony', seatsPerRow: 14 }],
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
    create: (options) => templates.threeSections(options),
  },
  { id: 'single', label: 'Single block', create: (options) => templates.single(options) },
  { id: 'stadium', label: 'Stadium', create: (options) => templates.stadium(options) },
  {
    id: 'balcony',
    label: 'Two levels: stalls + balcony',
    create: (options) => templates.balcony(options),
  },
];
