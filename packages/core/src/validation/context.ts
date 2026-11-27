import type {
  BandBox,
  BuiltHallLayout,
  BuiltRow,
  BuiltSeat,
  BuiltSectionBox,
  HallLayout,
} from '../layout.js';
import {
  DEFAULT_CONSTRAINTS,
  type Constraints,
  type HallConfig,
  type ResolvedConstraints,
} from '../schema.js';

/**
 * A rule context with every field filled in: the layout as `buildHallLayout` returns it and every
 * threshold set. `validateHall` builds one; `resolveRuleContext` makes one from a context built by
 * hand.
 */
export interface ResolvedRuleContext {
  config: HallConfig;
  layout: BuiltHallLayout;
  constraints: ResolvedConstraints;
}

/** What `resolveRuleContext` accepts: the public `ValidationRuleContext` shape. */
interface RuleContextInput {
  config: HallConfig;
  layout: HallLayout;
  constraints: Constraints;
}

/** Contexts that `validateHall` built for one run, with every field already complete. */
const resolved = new WeakSet<object>();

/** Marks a context whose layout and thresholds are already complete, so rules use it as it is. */
export function markResolvedContext(ctx: ResolvedRuleContext): ResolvedRuleContext {
  resolved.add(ctx);
  return ctx;
}

function definedOnly(source: object): Partial<ResolvedConstraints> {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined),
  ) as Partial<ResolvedConstraints>;
}

/**
 * Fills in what a hand-built layout may leave out. A missing level means 0; a layout without
 * `bands` is a single-level hall, so its bands are taken from its own rows and sections.
 */
function completeLayout(layout: HallLayout, config: HallConfig, constraints: ResolvedConstraints) {
  const rows: BuiltRow[] = layout.rows.map((row) => ({ ...row, level: row.level ?? 0 }));
  const seats: BuiltSeat[] = layout.seats.map((seat) => ({ ...seat, level: seat.level ?? 0 }));
  const sections: BuiltSectionBox[] = layout.sections.map((box) => ({
    ...box,
    level: box.level ?? 0,
    floorElevation: box.floorElevation ?? layout.rows[box.firstRowIndex]?.elevation ?? 0,
  }));
  const bands: BandBox[] =
    layout.bands ??
    config.layout.bands.map((band, index) => {
      const boxes = sections.filter((box) => box.bandId === band.id);
      const own = rows.filter((row) => row.bandId === band.id);
      const floor = own[0]?.elevation ?? 0;
      return {
        id: band.id,
        ...(band.label !== undefined ? { label: band.label } : {}),
        index,
        level: own[0]?.level ?? 0,
        minZ: boxes.length > 0 ? Math.min(...boxes.map((box) => box.minZ)) : 0,
        maxZ: boxes.length > 0 ? Math.max(...boxes.map((box) => box.maxZ)) : 0,
        floorElevation: floor,
        topElevation: own.at(-1)?.elevation ?? floor,
        overhang: false,
      };
    });
  const built: BuiltHallLayout = {
    ...layout,
    balconySlabThickness: layout.balconySlabThickness ?? constraints.balconySlabThickness,
    balconyParapetHeight: layout.balconyParapetHeight ?? constraints.balconyParapetHeight,
    seats,
    rows,
    sections,
    bands,
  };
  return built;
}

/**
 * The rule context with every field filled in. A context from `validateHall` is returned as it is.
 * For a context built by hand (a test of a custom rule, or a direct call of `defaultRules`), the
 * thresholds it leaves out get their defaults (`DEFAULT_CONSTRAINTS`) and the layout gets the level
 * and balcony fields that `buildHallLayout` sets: a missing level means 0, missing balcony sizes
 * come from the thresholds, and a layout without `bands` is a single-level hall. A hand-built
 * context is read again on every call, so a change to its fields is seen by the next check.
 *
 * @example
 * ```ts
 * const rule: ValidationRule = {
 *   code: 'custom.balconies',
 *   check(ctx) {
 *     const { layout } = resolveRuleContext(ctx);
 *     return layout.bands.some((band) => band.level > 1) ? [] : [];
 *   },
 * };
 * ```
 */
export function resolveRuleContext(ctx: RuleContextInput): ResolvedRuleContext {
  if (resolved.has(ctx)) return ctx as ResolvedRuleContext;
  const constraints: ResolvedConstraints = {
    ...DEFAULT_CONSTRAINTS,
    ...definedOnly(ctx.constraints),
  };
  return {
    config: ctx.config,
    layout: completeLayout(ctx.layout, ctx.config, constraints),
    constraints,
  };
}
