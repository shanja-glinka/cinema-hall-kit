/**
 * Hall checks that run in the browser (instant feedback while the user types) and again on the
 * server (the authority). Pure functions over `@cinema-hall/core`: no I/O, no server imports.
 */
import {
  formatIssue,
  hasErrors,
  issueMessages,
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
import { LOCALE, t } from './texts';
import type { IssueView, TierView } from './types';

/**
 * An issue as text: the library's own English issue catalog (`issueMessages.en`) and the demo's
 * words for the place.
 */
export function toIssueView(issue: Issue): IssueView {
  const texts = t.issues;
  return {
    severity: issue.severity,
    code: issue.code,
    text: formatIssue(issue, issueMessages.en, LOCALE),
    position: issue.position ? texts.position(issue.position.line, issue.position.col) : '',
    path: pathToString(issue.path),
    place: describePath(issue.path),
  };
}

export function messageIssue(code: string, text: string): IssueView {
  return { severity: 'error', code, text, position: '', path: '', place: '' };
}

const TOP_LEVEL_PLACES = [
  'hall',
  'screen',
  'seatTypes',
  'pricing',
  'layout',
  'constraints',
  'viewingZones',
  'meta',
  'name',
  'id',
  'version',
] as const;
type TopLevelPlace = (typeof TOP_LEVEL_PLACES)[number];

function isTopLevelPlace(value: string): value is TopLevelPlace {
  return (TOP_LEVEL_PLACES as readonly string[]).includes(value);
}

/**
 * Where an issue is, in words for a hall administrator: `Seating area 1 › section 2 › seats per
 * row` for `layout.bands[0].sections[1].seatsPerRow`. Empty for the whole document. The raw path
 * stays available as technical detail.
 * @param path The issue path from the library.
 * @returns A short description, or an empty string.
 */
export function describePath(path: readonly (string | number)[]): string {
  const [head, ...rest] = path;
  if (head === undefined) return '';
  const places = t.places;
  const fieldName = (field: string): string =>
    Object.hasOwn(places.fields, field) ? (places.fields[field] ?? field) : field;
  const parts: string[] = [];
  if (head === 'layout' && rest[0] === 'bands' && typeof rest[1] === 'number') {
    parts.push(places.seatingArea(rest[1] + 1));
    let tail = rest.slice(2);
    if (tail[0] === 'sections' && typeof tail[1] === 'number') {
      parts.push(places.section(tail[1] + 1));
      tail = tail.slice(2);
    }
    if (tail[0] === 'defaults') tail = tail.slice(1);
    const field = tail[0];
    if (typeof field === 'string') parts.push(fieldName(field));
    return parts.join(' › ');
  }
  if (head === 'seatTypes' && typeof rest[0] === 'string') {
    parts.push(places.seatType(rest[0]));
    const field = rest[1];
    if (typeof field === 'string') parts.push(fieldName(field));
    return parts.join(' › ');
  }
  parts.push(
    typeof head === 'string' ? (isTopLevelPlace(head) ? places[head] : head) : String(head),
  );
  const field = rest[0];
  if (typeof field === 'string' && head !== 'meta') parts.push(fieldName(field));
  return parts.join(' › ');
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
 * @param options `enforce: true` on the server; `maxBytes` for the size limit (the library's default, 256 KiB, when omitted).
 * @returns The config when it has no errors, otherwise the issues.
 */
export function checkHallText(
  text: string,
  options: { enforce?: boolean; maxBytes?: number } = {},
): HallCheck {
  const texts = t.issues;
  const view = (issue: Issue): IssueView => toIssueView(issue);
  if (text.trim() === '') {
    return {
      ok: false,
      errors: [messageIssue('input.empty', texts.empty)],
      warnings: [],
    };
  }
  try {
    const parsed = parseHallConfig(text, {
      format: 'auto',
      ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
    });
    if (!parsed.ok) return { ok: false, errors: parsed.issues.map(view), warnings: [] };
    const issues = dedupe([
      ...parsed.issues,
      ...validateHall(parsed.config, { enforce: options.enforce === true }),
    ]);
    const views = issues.map(view);
    const warnings = views.filter((view) => view.severity === 'warning');
    if (hasErrors(issues)) {
      return { ok: false, errors: views.filter((view) => view.severity === 'error'), warnings };
    }
    return { ok: true, config: parsed.config, warnings };
  } catch {
    return {
      ok: false,
      errors: [messageIssue('input.unreadable', texts.unreadable)],
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
