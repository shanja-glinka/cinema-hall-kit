/**
 * Date labels of the demo, one format everywhere: `Nov 28`, `Sat, Nov 28`, `Sat, November 28`
 * (`Intl` with `en-US`). Pure functions over ISO calendar dates (`YYYY-MM-DD`), safe for client and
 * server files.
 */
import { LOCALE } from './texts';

function formatDate(date: string, options: Intl.DateTimeFormatOptions): string {
  const [year, month, day] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  return new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: 'UTC' }).format(utc);
}

/** `Sat, November 22`: the weekday and date. */
export function dateLabel(date: string): string {
  return formatDate(date, { weekday: 'short', day: 'numeric', month: 'long' });
}

/** `Nov 22`. */
export function dateShort(date: string): string {
  return formatDate(date, { day: 'numeric', month: 'short' });
}

/** `Sat, Nov 22`: the label of a day in a date picker. */
export function dateOption(date: string): string {
  return formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** `Nov 22 · 18:30`: how a showtime is named in messages. */
export function showtimeLabel(date: string, time: string): string {
  return `${dateShort(date)} · ${time}`;
}
