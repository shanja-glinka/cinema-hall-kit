/**
 * Hall checks that run in the browser (instant feedback while the user types) and again on the
 * server (the authority). Pure functions over `@cinema-hall/core`: no I/O, no server imports.
 */
import {
  formatIssue,
  hasErrors,
  parseHallConfig,
  pathToString,
  priceForSeat,
  validateHall,
  type HallConfig,
  type HallLayout,
  type Issue,
  type Price,
  type Pricing,
} from '@cinema-hall/core';
import type { IssueView, TierView } from './types';

export function toIssueView(issue: Issue): IssueView {
  return {
    severity: issue.severity,
    code: issue.code,
    text: formatIssue(issue, undefined, 'en-US'),
    position: issue.position ? `line ${issue.position.line}, column ${issue.position.col}` : '',
    path: pathToString(issue.path),
  };
}

export function messageIssue(code: string, text: string): IssueView {
  return { severity: 'error', code, text, position: '', path: '' };
}

export type HallCheck =
  | { ok: true; config: HallConfig; warnings: IssueView[] }
  | { ok: false; errors: IssueView[]; warnings: IssueView[] };

function dedupe(issues: readonly Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}|${pathToString(issue.path)}|${JSON.stringify(issue.params ?? {})}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Structure (`parseHallConfig`) plus geometry and comfort rules (`validateHall`). Errors of either
 * kind block the hall; warnings do not. `enforce` is for the server: thresholds written in the
 * document are ignored there, so a client cannot loosen them.
 * @param text YAML or JSON text.
 * @param options `enforce: true` on the server.
 * @returns The config when it has no errors, otherwise the issues.
 */
export function checkHallText(text: string, options: { enforce?: boolean } = {}): HallCheck {
  if (text.trim() === '') {
    return {
      ok: false,
      errors: [messageIssue('input.empty', 'Paste YAML or choose a file.')],
      warnings: [],
    };
  }
  try {
    const parsed = parseHallConfig(text, { format: 'auto' });
    if (!parsed.ok) return { ok: false, errors: parsed.issues.map(toIssueView), warnings: [] };
    const issues = dedupe([
      ...parsed.issues,
      ...validateHall(parsed.config, { enforce: options.enforce === true }),
    ]);
    const views = issues.map(toIssueView);
    const warnings = views.filter((view) => view.severity === 'warning');
    if (hasErrors(issues)) {
      return { ok: false, errors: views.filter((view) => view.severity === 'error'), warnings };
    }
    return { ok: true, config: parsed.config, warnings };
  } catch {
    return {
      ok: false,
      errors: [messageIssue('input.unreadable', 'Could not read the text.')],
      warnings: [],
    };
  }
}

/**
 * The price of a tier in a pricing table, or `null` when the table has none for it. Goes through
 * the library's `priceForSeat` with a key no seat has, so only a number that the table owns counts:
 * a tier called `constructor` does not read `Object.prototype`.
 */
export function tierPrice(pricing: Pricing | undefined, tier: string): Price | null {
  return priceForSeat(pricing, { key: '', priceTier: tier });
}

/** Price tiers of a layout in seat order: how many seats each has, its colour and base price. */
export function tiersOf(layout: HallLayout): TierView[] {
  const tiers = new Map<string, TierView>();
  for (const seat of layout.seats) {
    const known = tiers.get(seat.priceTier);
    if (known) {
      known.count += 1;
      continue;
    }
    tiers.set(seat.priceTier, {
      tier: seat.priceTier,
      label: layout.seatTypes[seat.priceTier]?.label ?? seat.priceTier,
      count: 1,
      color: seat.color,
      price: tierPrice(layout.pricing, seat.priceTier),
    });
  }
  return [...tiers.values()];
}
