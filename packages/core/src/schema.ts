import { z } from 'zod';

/**
 * Hall config schema, version 1.
 *
 * The zod schema is the single source of truth for the config's TypeScript types,
 * its structural validation and the published JSON Schema.
 * Units: metres and degrees. Colours: `#RRGGBB`.
 *
 * Coordinates used by the layout: origin at the centre of the screen's bottom edge projected on
 * the floor; X to the right as seen by a viewer facing the screen; Y up; Z from the screen into the
 * hall.
 */

/**
 * The only config `version` this library reads. A higher version is rejected with
 * `schema.unsupportedVersion`.
 */
export const SUPPORTED_CONFIG_VERSION = 1;

/** Hard structural limits. They are checked before any geometry is computed (protects servers). */
export const LIMITS = {
  maxBytes: 256 * 1024,
  maxRowsPerSection: 100,
  maxSeatsPerRow: 200,
  maxSeatsTotal: 5000,
  maxSections: 64,
  maxBands: 32,
  maxSeatTypes: 32,
  maxMetres: 500,
} as const;

/**
 * Identifiers of bands, sections, seat types and zones. No dots: they are used inside `SeatKey`.
 */
export const IdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
    'letters, digits, "-" and "_"; must not start with a symbol',
  );

/** A colour as `#RRGGBB`: six hex digits, no alpha and no short form. */
export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'colour must be #RRGGBB');

/**
 * Free-form JSON owned by the host application. Preserved on round-trip, ignored by the library.
 */
export const MetaSchema = z.record(z.string(), z.unknown());

/** Seat key local to a section: `r<row>.s<seat>`, both 1-based. */
export const LocalSeatKeySchema = z
  .string()
  .regex(/^r[1-9]\d*\.s[1-9]\d*$/, 'expected r<row>.s<seat>');

const metres = z.number().finite().positive().max(LIMITS.maxMetres);
const nonNegativeMetres = z.number().finite().min(0).max(LIMITS.maxMetres);
const rowCount = z.number().int().min(1).max(LIMITS.maxRowsPerSection);
const seatCount = z.number().int().min(1).max(LIMITS.maxSeatsPerRow);

/**
 * The hall box: the interior size in metres (width along the screen, depth from the screen to the
 * back wall, height to the ceiling), with optional wall and floor colours. Unknown keys are
 * rejected.
 */
export const HallBoxSchema = z.strictObject({
  width: metres,
  depth: metres,
  height: metres,
  wallColor: HexColorSchema.optional(),
  floorColor: HexColorSchema.optional(),
  meta: MetaSchema.optional(),
});

/**
 * The screen in metres: its size, the height of its bottom edge above the floor, and an optional
 * curvature.
 */
export const ScreenSchema = z.strictObject({
  width: metres,
  height: metres,
  /** Floor to the bottom edge of the screen. */
  elevation: nonNegativeMetres,
  /** Sagitta of a curved screen (how much closer the edges are than the centre); 0 = flat. */
  curvature: nonNegativeMetres.optional(),
});

/**
 * A seat type: a label, the body size in metres (width across, depth from front to back) and the
 * seat colour.
 */
export const SeatTypeSchema = z.strictObject({
  label: z.string().min(1).max(64),
  /** Width of the seat body. */
  width: metres,
  /** Depth of the seat body (front to back). */
  depth: metres,
  color: HexColorSchema,
  meta: MetaSchema.optional(),
});

/** Section values a band may provide as defaults. */
const sectionGeometry = {
  rows: rowCount.optional(),
  /** Distance between the centre lines of adjacent rows. */
  rowSpacing: metres.optional(),
  /** Seat centre to seat centre within a row. */
  seatPitch: metres.optional(),
  seatType: IdSchema.optional(),
  /** Pricing tier; defaults to the seat type id. */
  priceTier: IdSchema.optional(),
};

/**
 * Defaults that a band gives its sections. A value set on a section overrides the band's default.
 */
export const BandDefaultsSchema = z.strictObject(sectionGeometry);

/**
 * A section: a block of seats in one band. Any geometry the section does not set comes from its
 * band's `defaults`.
 */
export const SectionSchema = z.strictObject({
  id: IdSchema,
  seatsPerRow: seatCount,
  /** Aisle width to the left of the section (ignored for the first section of a band). */
  gapBefore: nonNegativeMetres.optional(),
  ...sectionGeometry,
  /** Overrides the seat type colour for this section. */
  color: HexColorSchema.optional(),
  /** Positions with no seat (aisle, wheelchair space). Local keys `r<row>.s<seat>`. */
  exclude: z.array(LocalSeatKeySchema).max(LIMITS.maxSeatsTotal).optional(),
  meta: MetaSchema.optional(),
});

/**
 * A band: one group of rows, such as a stalls block or a balcony. Bands follow each other from the
 * screen to the back of the hall.
 */
export const BandSchema = z.strictObject({
  id: IdSchema,
  /**
   * Distance from the last row of the previous band to the first row of this band.
   * Default: the row spacing of this band's first section. Ignored for the first band.
   */
  gapBefore: nonNegativeMetres.optional(),
  /** Height added by every row of this band (stadium rake). Default 0. */
  riserHeight: nonNegativeMetres.optional(),
  defaults: BandDefaultsSchema.optional(),
  sections: z.array(SectionSchema).min(1).max(LIMITS.maxSections),
  meta: MetaSchema.optional(),
});

/**
 * Row labels: a named scheme (`alphabetic` for A to Z and then AA, or `numeric` for 1, 2, …) or an
 * explicit list with one label per row across all bands.
 */
export const RowLabelsSchema = z.union([
  z.enum(['alphabetic', 'numeric']),
  z
    .array(z.string().min(1).max(8))
    .min(1)
    .max(LIMITS.maxRowsPerSection * LIMITS.maxBands),
]);

/**
 * How seats are numbered within a row. `continuous` numbers left to right through all sections of a
 * band row. `perSection` starts again at 1 in each section.
 */
export const SeatNumberingSchema = z.enum(['continuous', 'perSection']);

/**
 * The layout: distance from the screen to the first row, row labels, seat numbering, eye height and
 * the bands.
 */
export const LayoutSchema = z.strictObject({
  /** Screen plane to the centre line of the first row. */
  firstRowDistance: metres,
  /** Default `alphabetic` (A…Z, AA…). Row labels run through all bands. */
  rowLabels: RowLabelsSchema.optional(),
  /** Default `continuous`: numbers run left to right through all sections of a band row. */
  seatNumbering: SeatNumberingSchema.optional(),
  /** Eye height of a seated viewer above the floor of their row. Default 1.15. */
  eyeHeight: metres.optional(),
  bands: z.array(BandSchema).min(1).max(LIMITS.maxBands),
});

/**
 * Per-hall thresholds for comfort and geometry, overriding `DEFAULT_CONSTRAINTS`. Distances are in
 * metres and angles in degrees.
 */
export const ConstraintsSchema = z.strictObject({
  minAisleWidth: nonNegativeMetres.optional(),
  minWallClearance: nonNegativeMetres.optional(),
  minRearClearance: nonNegativeMetres.optional(),
  minLegroom: nonNegativeMetres.optional(),
  minHeadroom: nonNegativeMetres.optional(),
  minFirstRowDistanceRatio: z.number().finite().min(0).max(10).optional(),
  maxFrontRowVerticalAngle: z.number().finite().min(0).max(90).optional(),
  /** Head height above eye level used by the sightline check. */
  headAboveEye: nonNegativeMetres.optional(),
});

/** A price: plain units with at most two decimals, no currency (`450`, `450.5`). */
export const PriceSchema = z
  .number()
  .finite()
  .min(0)
  .max(1_000_000_000)
  .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, 'at most two decimals');

/**
 * Base prices of the hall, per pricing tier. A section's tier is its `priceTier`, defaulting to its
 * seat type id. A session may override any tier with the same units.
 */
export const PricingSchema = z.strictObject({
  tiers: z.record(IdSchema, PriceSchema),
});

/**
 * A named band of viewing positions. A seat belongs to the first zone, in config order, whose
 * `minFov` it reaches. `minFov` is the least horizontal field of view of the screen, in degrees,
 * that the seat must see.
 */
export const ViewingZoneSchema = z.strictObject({
  id: IdSchema,
  label: z.string().min(1).max(64),
  /** Minimum horizontal field of view the screen occupies, degrees. */
  minFov: z.number().finite().min(0).max(180),
});

/**
 * The whole hall config, version 1. Its TypeScript type is `HallConfig`. `parseHallConfig` runs
 * this schema and then the structural checks.
 */
export const HallConfigSchema = z.strictObject({
  version: z.literal(SUPPORTED_CONFIG_VERSION),
  /** Optional: the primary key of a hall lives in the host's database. */
  id: IdSchema.optional(),
  name: z.string().min(1).max(120),
  meta: MetaSchema.optional(),
  hall: HallBoxSchema,
  screen: ScreenSchema,
  seatTypes: z.record(IdSchema, SeatTypeSchema),
  layout: LayoutSchema,
  constraints: ConstraintsSchema.optional(),
  pricing: PricingSchema.optional(),
  viewingZones: z.array(ViewingZoneSchema).min(1).max(16).optional(),
});

/** A hall config as produced by `parseHallConfig`. */
export type HallConfig = z.infer<typeof HallConfigSchema>;
/** Type of the `hall` block. */
export type HallBox = z.infer<typeof HallBoxSchema>;
/** Type of the `screen` block. */
export type ScreenConfig = z.infer<typeof ScreenSchema>;
/** Type of one entry of `seatTypes`. */
export type SeatTypeConfig = z.infer<typeof SeatTypeSchema>;
/** Type of one band. */
export type BandConfig = z.infer<typeof BandSchema>;
/** Type of a band's `defaults`. */
export type BandDefaults = z.infer<typeof BandDefaultsSchema>;
/** Type of one section. */
export type SectionConfig = z.infer<typeof SectionSchema>;
/** Type of the `layout` block. */
export type LayoutConfig = z.infer<typeof LayoutSchema>;
/** Row label scheme: `'alphabetic'`, `'numeric'` or a list of labels. */
export type RowLabels = z.infer<typeof RowLabelsSchema>;
/** `'continuous'` or `'perSection'`. */
export type SeatNumbering = z.infer<typeof SeatNumberingSchema>;
/** Every threshold of `ConstraintsSchema`, with all fields set. Compare `DEFAULT_CONSTRAINTS`. */
export type Constraints = Required<z.infer<typeof ConstraintsSchema>>;
/** One viewing zone. */
export type ViewingZone = z.infer<typeof ViewingZoneSchema>;
/** Type of the `pricing` block: the base price for each tier. */
export type PricingConfig = z.infer<typeof PricingSchema>;
/** Free-form host data. The library keeps it on round-trips and ignores it. */
export type Meta = z.infer<typeof MetaSchema>;

/** Engineering defaults, not regulations. Override per project via `constraints`. */
export const DEFAULT_CONSTRAINTS: Constraints = {
  minAisleWidth: 0.9,
  minWallClearance: 1.0,
  minRearClearance: 1.0,
  minLegroom: 0.3,
  minHeadroom: 0.5,
  minFirstRowDistanceRatio: 0.4,
  maxFrontRowVerticalAngle: 40,
  headAboveEye: 0.12,
};

/**
 * Eye height of a seated viewer above the floor of their row, in metres. Used when
 * `layout.eyeHeight` is not set.
 */
export const DEFAULT_EYE_HEIGHT = 1.15;

/**
 * Viewing zones used when a config has none: up close (from 70 degrees of the screen), sweet spot
 * (50) and full picture (0). Zones are checked in order, so the strictest comes first.
 */
export const DEFAULT_VIEWING_ZONES: readonly ViewingZone[] = [
  { id: 'up-close', label: 'Up close', minFov: 70 },
  { id: 'sweet-spot', label: 'Sweet spot', minFov: 50 },
  { id: 'full-picture', label: 'Full picture', minFov: 0 },
];

/** Identity helper that gives autocompletion and type checking when a hall is written in code. */
export function defineHall(config: HallConfig): HallConfig {
  return config;
}
