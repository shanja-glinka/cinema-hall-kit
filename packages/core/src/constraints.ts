import {
  DEFAULT_CONSTRAINTS,
  type Constraints,
  type HallConfig,
  type ResolvedConstraints,
} from './schema.js';

/**
 * Where the constraint thresholds come from: overrides from the host and whether the config's own
 * `constraints` count. `validateHall` and `buildHallLayout` take the same fields, so the balcony
 * sizes a renderer draws are the ones the validation checks.
 */
export interface ConstraintOptions {
  /** Threshold overrides. They take priority over the config's own `constraints`. */
  constraints?: Partial<Constraints>;
  /** Server mode: ignore `config.constraints`; only `constraints` above and defaults apply. */
  enforce?: boolean;
}

function definedOnly(source: Partial<Constraints>): Partial<Constraints> {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined),
  ) as Partial<Constraints>;
}

/**
 * Priority: opts.constraints > config.constraints (unless enforce) > DEFAULT_CONSTRAINTS. Every
 * field of the result is set.
 */
export function resolveConstraints(
  config: HallConfig,
  opts?: ConstraintOptions,
): ResolvedConstraints {
  const fromConfig: Partial<Constraints> = opts?.enforce ? {} : (config.constraints ?? {});
  return {
    ...DEFAULT_CONSTRAINTS,
    ...definedOnly(fromConfig),
    ...definedOnly(opts?.constraints ?? {}),
  };
}
