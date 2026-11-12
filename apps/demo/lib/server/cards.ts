/**
 * Read models for the pages: a hall with its tiers and sessions as plain, serialisable data.
 * Used by Server Components and route handlers; the layout never crosses the wire.
 */
import { resolvePricing, type HallLayout } from '@cinema-hall/core';
import { tierPrice, tiersOf } from '@/lib/shared/hall-check';
import type { HallCard, SessionView, TierView } from '@/lib/shared/types';
import {
  allHalls,
  currentVersionOf,
  dateLabel,
  dateShort,
  findVersion,
  layoutOf,
  sessionStartMs,
  sessionsOfHall,
  type HallRecord,
  type SessionRecord,
} from './store';

const tierCache = new WeakMap<HallLayout, TierView[]>();

/** Tiers of a version's layout, computed once per layout. */
export function tiersOfLayout(layout: HallLayout): TierView[] {
  const cached = tierCache.get(layout);
  if (cached) return cached;
  const tiers = tiersOf(layout);
  tierCache.set(layout, tiers);
  return tiers;
}

export function sessionView(session: SessionRecord): SessionView {
  const layout = layoutOf(session.hallVersionId);
  const rev = findVersion(session.hallVersionId)?.rev ?? 0;
  const tiers = layout ? tiersOfLayout(layout) : [];
  const effective = layout ? resolvePricing(layout.pricing, session.pricing) : undefined;
  return {
    id: session.id,
    hallId: session.hallId,
    date: session.date,
    dateLabel: dateLabel(session.date),
    dateShort: dateShort(session.date),
    time: session.time,
    format: session.format,
    versionRev: rev,
    occupancyPercent: session.occupancyPercent,
    prices: tiers.map((tier) => ({
      tier: tier.tier,
      label: tier.label,
      price: tierPrice(effective, tier.tier),
      // Own property only: a tier called `constructor` is not an override of the prototype.
      overridden: session.pricing !== undefined && Object.hasOwn(session.pricing.tiers, tier.tier),
    })),
  };
}

export function hallCard(hall: HallRecord): HallCard | undefined {
  const version = currentVersionOf(hall);
  if (!version) return undefined;
  const layout = layoutOf(version.id);
  if (!layout) return undefined;
  const sessions = sessionsOfHall(hall.id);
  const now = Date.now();
  return {
    id: hall.id,
    name: hall.name,
    ...(hall.cinema ? { cinema: hall.cinema } : {}),
    currentRev: version.rev,
    seats: layout.seats.length,
    tiers: tiersOfLayout(layout),
    sessions: sessions.map(sessionView),
    outdatedSessions: sessions.filter(
      (session) => session.hallVersionId !== version.id && sessionStartMs(session) > now,
    ).length,
  };
}

/** Every hall that can be shown. One broken record must not take the home page down. */
export function allHallCards(): HallCard[] {
  return allHalls().flatMap((hall) => {
    try {
      const card = hallCard(hall);
      return card ? [card] : [];
    } catch {
      return [];
    }
  });
}
