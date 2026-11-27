/**
 * The session generator: dates × times → session specs. One implementation for the browser form
 * (live "will create N sessions") and for the server (which validates again and then creates).
 */
import { MAX_PRICE, roundPrice, type Price, type Pricing } from '@cinema-hall/core';
import { t, type Texts } from './texts';
import type { GeneratorInput, TierView } from './types';

type GeneratorTexts = Texts['generator'];

export const GENERATOR_LIMITS = {
  days: 31,
  slots: 12,
  sessionsPerRequest: 200,
  formatChars: 16,
} as const;

export const DEFAULT_OCCUPANCY_PERCENT = 40;

/**
 * The "seats occupied" value of a showtime form as the generator input: a blank field means no
 * pretend sales (`'0'`). The API keeps its own default for a request that leaves the field out.
 */
export function formOccupancyPercent(value: string): string {
  return value.trim() === '' ? '0' : value;
}

export interface SessionSpec {
  id: string;
  date: string;
  time: string;
  format: string;
  pricing?: Pricing;
  occupancyPercent: number;
}

export type GeneratorField = 'from' | 'to' | 'slots' | 'prices' | 'occupancyPercent' | 'generator';
export type GeneratorPlan =
  { ok: true; specs: SessionSpec[] } | { ok: false; field: GeneratorField; message: string };

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{1,2}):(\d{2})$/;
const FORMAT = /^[\p{L}\p{N}][\p{L}\p{N} +._-]*$/u;

/** Today as `YYYY-MM-DD` in the local time zone of whoever runs this (server or browser). */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** `YYYY-MM-DD` shifted by `days`, calendar arithmetic in UTC so that DST cannot skip a day. */
export function addDays(date: string, days: number): string {
  const match = DATE.exec(date);
  if (!match) return date;
  const moved = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return moved.toISOString().slice(0, 10);
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE.exec(value);
  if (!match) return false;
  return addDays(value, 0) === value;
}

/** `10:5` is refused, `9:30` becomes `09:30`; returns `null` for anything that is not a time. */
export function normalizeTime(value: string): string | null {
  const match = TIME.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

/** Splits `10:00, 13:30  17:00` into trimmed tokens (commas, semicolons, spaces, new lines). */
export function splitTimes(text: string): string[] {
  return text.split(/[\s,;]+/).filter((token) => token !== '');
}

export function sessionIdOf(hallId: string, date: string, time: string): string {
  return `${hallId}-${date.replaceAll('-', '')}-${time.replace(':', '')}`;
}

/**
 * A price from user input: a number or a string like `450` or `450,5`. At most two decimals, from
 * 0 to `MAX_PRICE`, no currency (api.md §2.6). Returns `null` when it is not acceptable.
 */
export function parsePrice(raw: unknown): Price | null {
  let value: number;
  if (typeof raw === 'number') value = raw;
  else if (typeof raw === 'string' && /^\d+([.,]\d{1,2})?$/.test(raw.trim())) {
    value = Number(raw.trim().replace(',', '.'));
  } else return null;
  if (!Number.isFinite(value) || value < 0 || value > MAX_PRICE) return null;
  return roundPrice(value) === value ? value : null;
}

/**
 * Turns generator input into session specs for a hall with these tiers. Prices equal to the hall
 * price are not overrides and are dropped. Dates before `today` are refused.
 * @param hallId Used in the session ids.
 * @param input Untrusted input.
 * @param tiers Tiers of the hall version the sessions will use.
 * @param today `YYYY-MM-DD`.
 */
export function planSessions(
  hallId: string,
  input: unknown,
  tiers: readonly TierView[],
  today: string,
): GeneratorPlan {
  const texts = t.generator;
  if (typeof input !== 'object' || input === null) {
    return { ok: false, field: 'generator', message: texts.required };
  }
  const raw: Partial<Record<keyof GeneratorInput, unknown>> = { ...input };

  const { from, to } = raw;
  if (!isIsoDate(from)) return { ok: false, field: 'from', message: texts.startDate };
  if (!isIsoDate(to)) return { ok: false, field: 'to', message: texts.endDate };
  if (from < today) {
    return { ok: false, field: 'from', message: texts.startPassed };
  }
  if (to < from) {
    return { ok: false, field: 'to', message: texts.endBeforeStart };
  }
  // Counted, not walked: the loop below never steps past `to`, so the last supported day
  // (9999-12-31) is a normal one-day range.
  const dayCount = daysBetween(from, to) + 1;
  if (dayCount > GENERATOR_LIMITS.days) {
    return {
      ok: false,
      field: 'to',
      message: texts.rangeTooLong(GENERATOR_LIMITS.days),
    };
  }

  const slots = parseSlots(raw.slots, texts);
  if (typeof slots === 'string') return { ok: false, field: 'slots', message: slots };
  if (dayCount * slots.length > GENERATOR_LIMITS.sessionsPerRequest) {
    return {
      ok: false,
      field: 'slots',
      message: texts.tooMany(GENERATOR_LIMITS.sessionsPerRequest, dayCount * slots.length),
    };
  }

  const pricing = parseOverrides(raw.prices, tiers, texts);
  if (typeof pricing === 'string') return { ok: false, field: 'prices', message: pricing };

  const occupancy = parseOccupancy(raw.occupancyPercent);
  if (occupancy === null) {
    return {
      ok: false,
      field: 'occupancyPercent',
      message: texts.occupancy,
    };
  }

  const specs: SessionSpec[] = [];
  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = offset === 0 ? from : addDays(from, offset);
    for (const slot of slots) {
      specs.push({
        id: sessionIdOf(hallId, date, slot.time),
        date,
        time: slot.time,
        format: slot.format,
        ...(pricing ? { pricing } : {}),
        occupancyPercent: occupancy,
      });
    }
  }
  return { ok: true, specs };
}

/** Days between two valid ISO dates, `to` minus `from`, by UTC calendar arithmetic. */
function daysBetween(from: string, to: string): number {
  const parse = (date: string): number => {
    const match = DATE.exec(date);
    return Date.UTC(Number(match?.[1]), Number(match?.[2]) - 1, Number(match?.[3]));
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

function parseSlots(
  value: unknown,
  texts: GeneratorTexts,
): { time: string; format: string }[] | string {
  if (!Array.isArray(value) || value.length === 0) return texts.noTimes;
  if (value.length > GENERATOR_LIMITS.slots) return texts.tooManyTimes(GENERATOR_LIMITS.slots);
  const slots: { time: string; format: string }[] = [];
  const seen = new Set<string>();
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'object' || entry === null) return texts.invalidShowtime;
    const record: Record<string, unknown> = { ...entry };
    // Never coerce an untrusted value to text: only a string is echoed back.
    if (typeof record.time !== 'string') return texts.timeNotText;
    const time = normalizeTime(record.time);
    if (time === null) {
      return texts.badTime(record.time.slice(0, 20));
    }
    if (seen.has(time)) return texts.duplicateTime(time);
    seen.add(time);
    const format = typeof record.format === 'string' ? record.format.trim() : '';
    if (format === '' || format.length > GENERATOR_LIMITS.formatChars || !FORMAT.test(format)) {
      return texts.badFormat(time, GENERATOR_LIMITS.formatChars);
    }
    slots.push({ time, format });
  }
  return slots;
}

function parseOverrides(
  value: unknown,
  tiers: readonly TierView[],
  texts: GeneratorTexts,
): Pricing | undefined | string {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) return texts.pricesFormat;
  const record: Record<string, unknown> = { ...value };
  const overrides = new Map<string, Price>();
  for (const [tier, entry] of Object.entries(record)) {
    const known = tiers.find((candidate) => candidate.tier === tier);
    if (!known) return texts.unknownTier(tier.slice(0, 40));
    if (typeof entry === 'string' && entry.trim() === '') continue;
    const price = parsePrice(entry);
    if (price === null) {
      return texts.badPrice(known.label);
    }
    if (price !== known.price) overrides.set(tier, price);
  }
  return overrides.size > 0 ? { tiers: Object.fromEntries(overrides) } : undefined;
}

function parseOccupancy(value: unknown): number | null {
  if (value === undefined || value === '') return DEFAULT_OCCUPANCY_PERCENT;
  const number = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof number !== 'number' || !Number.isInteger(number)) return null;
  return number >= 0 && number <= 100 ? number : null;
}
