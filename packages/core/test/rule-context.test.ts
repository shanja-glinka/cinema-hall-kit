/** Hand-built rule contexts and layouts keep working with the built-in rules. */
import { describe, expect, it } from 'vitest';
import { buildHallLayout, type HallLayout } from '../src/layout.js';
import { DEFAULT_CONSTRAINTS, type Constraints, type HallConfig } from '../src/schema.js';
import { templates } from '../src/templates.js';
import {
  defaultRules,
  resolveRuleContext,
  validateHall,
  type ValidationRule,
  type ValidationRuleContext,
} from '../src/validation.js';
import { fixtureConfig } from './support.js';

describe('ValidationRuleContext stays compatible with hand-built inputs', () => {
  /** A layout typed with the public interface, without the fields `buildHallLayout` adds. */
  function handBuilt(config: HallConfig): HallLayout {
    const {
      bands: _bands,
      balconySlabThickness: _t,
      balconyParapetHeight: _p,
      ...rest
    } = buildHallLayout(config);
    return {
      ...rest,
      seats: rest.seats.map(({ level: _level, ...seat }) => seat),
      rows: rest.rows.map(({ level: _level, ...row }) => row),
      sections: rest.sections.map(({ level: _l, floorElevation: _f, ...box }) => box),
    };
  }

  /** Thresholds as integrations typed them before the balcony thresholds existed. */
  const legacy: Constraints = {
    minAisleWidth: DEFAULT_CONSTRAINTS.minAisleWidth,
    minWallClearance: DEFAULT_CONSTRAINTS.minWallClearance,
    minRearClearance: DEFAULT_CONSTRAINTS.minRearClearance,
    minLegroom: DEFAULT_CONSTRAINTS.minLegroom,
    minHeadroom: DEFAULT_CONSTRAINTS.minHeadroom,
    minFirstRowDistanceRatio: DEFAULT_CONSTRAINTS.minFirstRowDistanceRatio,
    maxFrontRowVerticalAngle: DEFAULT_CONSTRAINTS.maxFrontRowVerticalAngle,
    headAboveEye: DEFAULT_CONSTRAINTS.headAboveEye,
  };

  const runAll = (ctx: ValidationRuleContext) => defaultRules.flatMap((rule) => rule.check(ctx));

  it('runs every built-in rule on a hand-built single-level context', () => {
    const config = fixtureConfig();
    const ctx: ValidationRuleContext = { config, layout: handBuilt(config), constraints: legacy };
    expect(runAll(ctx)).toEqual(validateHall(config));
  });

  it('runs every built-in rule on a hand-built context of the multi-level template', () => {
    const config = templates.balcony();
    const ctx: ValidationRuleContext = {
      config,
      layout: buildHallLayout(config),
      constraints: legacy,
    };
    expect(runAll(ctx)).toEqual(validateHall(config));
  });

  it('fills in a hand-built context with resolveRuleContext', () => {
    const config = fixtureConfig();
    const ctx: ValidationRuleContext = { config, layout: handBuilt(config), constraints: legacy };
    const full = resolveRuleContext(ctx);
    expect(resolveRuleContext(ctx)).toEqual(full);
    expect(full.constraints).toEqual({ ...DEFAULT_CONSTRAINTS, ...legacy });
    const built = buildHallLayout(config);
    expect(full.layout.bands).toEqual(built.bands);
    expect(full.layout.seats).toEqual(built.seats);
    expect(full.layout.rows).toEqual(built.rows);
    expect(full.layout.sections).toEqual(built.sections);
    expect(full.layout.balconySlabThickness).toBe(built.balconySlabThickness);
    expect(full.layout.balconyParapetHeight).toBe(built.balconyParapetHeight);
  });

  it('accepts a custom rule written against the public context', () => {
    const rule: ValidationRule = {
      code: 'custom.seatCount',
      check: ({ layout, constraints }) =>
        layout.seats.length > 0 && constraints.minLegroom > 0 ? [] : [],
    };
    const config = fixtureConfig();
    expect(rule.check({ config, layout: handBuilt(config), constraints: legacy })).toEqual([]);
    expect(validateHall(config, { extraRules: [rule] })).toEqual(validateHall(config));
  });
});

describe('resolveRuleContext reads a hand-built context again on every call', () => {
  it('sees a threshold changed on a reused context', () => {
    const config = fixtureConfig();
    const ctx: ValidationRuleContext = {
      config,
      layout: buildHallLayout(config),
      constraints: { ...DEFAULT_CONSTRAINTS },
    };
    const widthRule = defaultRules.find((rule) => rule.code === 'fit.width')!;
    expect(widthRule.check(ctx)).toEqual([]);
    ctx.constraints.minWallClearance = 5;
    expect(widthRule.check(ctx).length).toBeGreaterThan(0);
    expect(resolveRuleContext(ctx).constraints.minWallClearance).toBe(5);
  });

  it('sees a layout replaced on a reused context', () => {
    const config = fixtureConfig();
    const ctx: ValidationRuleContext = {
      config,
      layout: buildHallLayout(config),
      constraints: { ...DEFAULT_CONSTRAINTS },
    };
    expect(resolveRuleContext(ctx).layout.seats.length).toBe(buildHallLayout(config).seats.length);
    ctx.layout = { ...ctx.layout, seats: ctx.layout.seats.slice(0, 1) };
    expect(resolveRuleContext(ctx).layout.seats.length).toBe(1);
  });
});

describe('buildHallLayout as a callback', () => {
  it('can be passed straight to Array.map', () => {
    const configs = [fixtureConfig(), fixtureConfig()];
    const layouts = configs.map(buildHallLayout);
    expect(layouts.map((layout) => layout.seats.length)).toEqual(
      configs.map((config) => buildHallLayout(config).seats.length),
    );
  });

  it('ignores a second argument that is not an options object', () => {
    const config = fixtureConfig();
    const plain = buildHallLayout(config);
    const call = buildHallLayout as (config: HallConfig, options?: unknown) => unknown;
    expect(call(config, 3)).toEqual(plain);
    expect(call(config, 'x')).toEqual(plain);
  });
});
