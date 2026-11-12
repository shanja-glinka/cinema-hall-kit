import { describe, expect, it } from 'vitest';
import { buildHallLayout } from '../src/layout.js';
import {
  formatPrice,
  priceForSeat,
  resolvePricing,
  roundPrice,
  sumPrices,
} from '../src/session.js';
import { validateHall } from '../src/validation.js';
import { parseHallConfig } from '../src/codec.js';
import { fixtureConfig } from './support.js';

describe('hall pricing (plain units, no currency)', () => {
  it('puts the hall prices into the layout and prices seats by their tier', () => {
    const layout = buildHallLayout(fixtureConfig());
    const recliner = layout.seats.find((s) => s.seatTypeId === 'recliner')!;
    expect(priceForSeat(layout.pricing, recliner)).toBe(650);
  });

  it('lets a session override a tier with the same units and keeps the others', () => {
    const layout = buildHallLayout(fixtureConfig());
    const pricing = resolvePricing(layout.pricing, { tiers: { standard: 550.5 } })!;
    expect(pricing.tiers.standard).toBe(550.5);
    expect(pricing.tiers.recliner).toBe(650);
    expect(resolvePricing(undefined, undefined)).toBeUndefined();
  });

  it('sums in cents without float drift', () => {
    expect(sumPrices([0.1, 0.2])).toBe(0.3);
    expect(sumPrices([450.5, 450.5, null])).toBeNull();
    expect(sumPrices([])).toBeNull();
    expect(roundPrice(1.005 + 2)).toBe(3.01);
  });

  it('formats with two decimals and a neutral sign', () => {
    expect(formatPrice(450.5)).toBe('450.50 ¤');
    expect(formatPrice(450.5, 'en-US')).toBe('450.50 ¤');
    expect(formatPrice(450.5, 'de-DE')).toBe('450,50 ¤');
    expect(formatPrice(1200, 'en-US', '')).toBe('1,200.00');
    expect(formatPrice(7, 'en-US', 'pts')).toBe('7.00 pts');
  });

  it('warns about a used tier without a price', () => {
    const config = fixtureConfig();
    delete config.pricing!.tiers.recliner;
    const issues = validateHall(config).filter((i) => i.code === 'pricing.missingTier');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.params).toEqual({ tier: 'recliner', seats: 28 });
  });

  it('rejects more than two decimals and a currency field', () => {
    const config = fixtureConfig();
    config.pricing!.tiers.standard = 450.555;
    expect(parseHallConfig(config).ok).toBe(false);
    const withCurrency = {
      ...fixtureConfig(),
      pricing: { currency: 'RUB', tiers: { standard: 1 } },
    };
    expect(parseHallConfig(withCurrency).ok).toBe(false);
  });
});

describe('session prices are host input', () => {
  it('canonicalises a session price to cents and ignores invalid ones', () => {
    const seat = { key: 'a.r1.s1', priceTier: 'standard' };
    expect(priceForSeat({ tiers: { standard: 1.234 } }, seat)).toBe(1.23);
    expect(priceForSeat({ tiers: { standard: -5 } }, seat)).toBeNull();
    expect(priceForSeat({ tiers: { standard: Number.NaN } }, seat)).toBeNull();
    expect(priceForSeat({ tiers: {}, seats: { 'a.r1.s1': 10.005 } }, seat)).toBe(10.01);
  });
});

describe('unrepresentable prices (review F47)', () => {
  it('treats a price above the limit as no price and never returns Infinity', () => {
    const seat = { key: 'a.r1.s1', priceTier: 'standard' };
    expect(priceForSeat({ tiers: { standard: Number.MAX_VALUE } }, seat)).toBeNull();
    expect(sumPrices([Number.MAX_VALUE])).toBeNull();
    expect(sumPrices([Infinity])).toBeNull();
  });
});
