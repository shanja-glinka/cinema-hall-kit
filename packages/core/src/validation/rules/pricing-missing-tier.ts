import type { Issue } from '../../issues.js';
import type { ValidationRule } from '../../validation.js';
import { makeIssue } from '../issue-helpers.js';

/** When the hall has prices, every pricing tier its seats use must have one (warning). */
export const pricingMissingTierRule: ValidationRule = {
  code: 'pricing.missingTier',
  /**
   * Reports `pricing.missingTier` as a warning, once for each pricing tier that seats use and
   * `pricing.tiers` does not list. A hall without pricing passes.
   */
  check({ config, layout }) {
    const tiers = config.pricing?.tiers;
    if (!tiers) return [];
    const counts = new Map<string, number>();
    for (const seat of layout.seats)
      counts.set(seat.priceTier, (counts.get(seat.priceTier) ?? 0) + 1);
    const issues: Issue[] = [];
    for (const [tier, seats] of counts) {
      if (!Object.hasOwn(tiers, tier)) {
        issues.push(
          makeIssue(config, 'warning', 'pricing.missingTier', ['pricing', 'tiers'], {
            tier,
            seats,
          }),
        );
      }
    }
    return issues;
  },
};
