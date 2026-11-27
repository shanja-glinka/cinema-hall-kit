import { describe, expect, expectTypeOf, it } from 'vitest';
import { resolveConstraints } from '../src/constraints.js';
import {
  DEFAULT_CONSTRAINTS,
  type Constraints,
  type HallConfig,
  type ResolvedConstraints,
} from '../src/schema.js';
import {
  validateHall,
  type ResolvedRuleContext,
  type ValidationRuleContext,
} from '../src/validation.js';
import { fixtureConfig } from './support.js';

/** A complete `Constraints` object as integrations typed it before the balcony thresholds. */
const legacy: Constraints = {
  minAisleWidth: 0.9,
  minWallClearance: 1,
  minRearClearance: 1,
  minLegroom: 0.3,
  minHeadroom: 0.5,
  minFirstRowDistanceRatio: 0.4,
  maxFrontRowVerticalAngle: 40,
  headAboveEye: 0.12,
};

describe('Constraints type', () => {
  it('accepts a complete object without the balcony thresholds', () => {
    expectTypeOf(legacy).toExtend<Constraints>();
    expectTypeOf<Constraints['minOverhangClearance']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<Constraints['minAisleWidth']>().toEqualTypeOf<number>();
    // @ts-expect-error The thresholds that always existed stay required.
    const missing: Constraints = { ...legacy, minAisleWidth: undefined };
    expect(missing).toBeDefined();
  });

  it('keeps DEFAULT_CONSTRAINTS and the resolved thresholds complete', () => {
    expectTypeOf(DEFAULT_CONSTRAINTS).toEqualTypeOf<ResolvedConstraints>();
    expectTypeOf(DEFAULT_CONSTRAINTS).toExtend<Constraints>();
    expectTypeOf<ResolvedConstraints['balconySlabThickness']>().toEqualTypeOf<number>();
    expectTypeOf(resolveConstraints).returns.toEqualTypeOf<ResolvedConstraints>();
    // The public rule context keeps the wider type; resolveRuleContext fills it in.
    expectTypeOf<ValidationRuleContext['constraints']>().toEqualTypeOf<Constraints>();
    expectTypeOf<ResolvedRuleContext['constraints']>().toEqualTypeOf<ResolvedConstraints>();
  });

  it('fills the balcony thresholds of an older object from the defaults', () => {
    const config: HallConfig = fixtureConfig();
    const resolved = resolveConstraints(config, { constraints: legacy });
    expect(resolved).toEqual({ ...DEFAULT_CONSTRAINTS, ...legacy });
    expect(resolved.minOverhangClearance).toBe(DEFAULT_CONSTRAINTS.minOverhangClearance);
    expect(validateHall(config, { constraints: legacy })).toEqual(validateHall(config));
  });
});
