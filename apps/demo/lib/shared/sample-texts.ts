/**
 * Display texts of the sample halls. Some older sample texts were unclear to a hall administrator
 * ("Lounge" for a recliner seat type); they are shown with their current wording instead. A text is
 * replaced only when it is one of the known texts for its id, so a name the administrator typed is
 * always shown as typed. Only the sample halls (`sample: true`) get these texts: a hall someone made
 * keeps every label as it was written, even one that matches an older sample text. Pure: safe for
 * client and server files.
 */
import type { HallConfig } from '@cinema-hall/core';
import type { HallCard, TierView } from './types';

interface KnownText {
  /** The text that is shown. */
  text: string;
  /** Older texts of the same object that are replaced by it. */
  aliases?: readonly string[];
}

/** Seat types of the sample halls, by seat type id (which is also the price tier id). */
const SEAT_TYPES: Readonly<Record<string, KnownText>> = {
  standard: { text: 'Classic' },
  recliner: { text: 'Lounge (recliners)', aliases: ['Lounge'] },
  balcony: { text: 'Balcony' },
  sofa: { text: 'Sofa' },
};

/** Rows of sections (bands) of the sample halls, by band id. */
const BANDS: Readonly<Record<string, KnownText>> = {
  stalls: { text: 'Stalls' },
  lounge: { text: 'Lounge', aliases: ['Lounge (recliners)'] },
  balcony: { text: 'Balcony' },
};

/** Viewing zones of the sample halls, by zone id. */
const ZONES: Readonly<Record<string, KnownText>> = {
  'up-close': { text: 'Up close' },
  'sweet-spot': { text: 'Sweet spot' },
  'full-picture': { text: 'Full picture' },
};

function known(
  table: Readonly<Record<string, KnownText>>,
  id: string,
  label: string | undefined,
): string | undefined {
  if (label === undefined || !Object.hasOwn(table, id)) return label;
  const entry = table[id]!;
  const texts = [entry.text, ...(entry.aliases ?? [])];
  return texts.includes(label.trim()) ? entry.text : label;
}

/** The shown label of a seat type (or of the price tier with the same id). */
export function seatTypeText(id: string, label: string): string {
  return known(SEAT_TYPES, id, label) ?? label;
}

/** The shown label of a band; `undefined` stays `undefined`. */
export function bandText(id: string, label: string | undefined): string | undefined {
  return known(BANDS, id, label);
}

/**
 * The hall with the known sample texts in their current wording: seat type, band and viewing zone
 * names. Returns the same object when nothing changes, so React props keep their identity.
 */
export function withSampleTexts(config: HallConfig): HallConfig {
  let changed = false;
  const seatTypes = Object.fromEntries(
    Object.entries(config.seatTypes).map(([id, type]) => {
      const label = seatTypeText(id, type.label);
      if (label === type.label) return [id, type];
      changed = true;
      return [id, { ...type, label }];
    }),
  ) as HallConfig['seatTypes'];
  const bands = config.layout.bands.map((band) => {
    const label = bandText(band.id, band.label);
    if (label === band.label) return band;
    changed = true;
    return { ...band, label };
  });
  const zones = config.viewingZones?.map((zone) => {
    const label = known(ZONES, zone.id, zone.label);
    if (label === zone.label) return zone;
    changed = true;
    return { ...zone, label };
  });
  if (!changed) return config;
  return {
    ...config,
    seatTypes,
    layout: { ...config.layout, bands },
    ...(zones ? { viewingZones: zones } : {}),
  } as HallConfig;
}

/**
 * The hall as it is shown and edited: `withSampleTexts` for a sample hall, and the config as it is
 * for any other hall, so labels someone typed are never changed (and never saved changed).
 * @param config The stored config.
 * @param sample Whether the hall is one of the samples the demo ships.
 */
export function sampleTextsFor(config: HallConfig, sample: boolean): HallConfig {
  return sample ? withSampleTexts(config) : config;
}

/** A tier with its shown label. */
export function withTierText<T extends Pick<TierView, 'tier' | 'label'>>(tier: T): T {
  const label = seatTypeText(tier.tier, tier.label);
  return label === tier.label ? tier : { ...tier, label };
}

/** A hall card with the shown labels of its tiers and showtime prices (sample halls only). */
export function withCardTexts(card: HallCard): HallCard {
  if (card.sample !== true) return card;
  return {
    ...card,
    tiers: card.tiers.map((tier) => withTierText(tier)),
    sessions: card.sessions.map((session) => ({
      ...session,
      prices: session.prices.map((price) => withTierText(price)),
    })),
  };
}
