/**
 * Hall ids of the demo backend: short latin slugs, unique among the halls. Pure functions, so the
 * upload page can tell the user in advance which id a new hall will get.
 */
import type { HallConfig } from '@cinema-hall/core';

const TRANSLIT: Record<string, string> = {
  '\u0430': 'a',
  '\u0431': 'b',
  '\u0432': 'v',
  '\u0433': 'g',
  '\u0434': 'd',
  '\u0435': 'e',
  '\u0451': 'e',
  '\u0436': 'zh',
  '\u0437': 'z',
  '\u0438': 'i',
  '\u0439': 'y',
  '\u043a': 'k',
  '\u043b': 'l',
  '\u043c': 'm',
  '\u043d': 'n',
  '\u043e': 'o',
  '\u043f': 'p',
  '\u0440': 'r',
  '\u0441': 's',
  '\u0442': 't',
  '\u0443': 'u',
  '\u0444': 'f',
  '\u0445': 'h',
  '\u0446': 'c',
  '\u0447': 'ch',
  '\u0448': 'sh',
  '\u0449': 'sch',
  '\u044a': '',
  '\u044b': 'y',
  '\u044c': '',
  '\u044d': 'e',
  '\u044e': 'yu',
  '\u044f': 'ya',
};

/** Converts a hall name to a short id made from latin letters, digits and dashes. */
export function slugify(name: string): string {
  const latin = [...name.toLowerCase()].map((char) => TRANSLIT[char] ?? char).join('');
  return latin
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** `base`, or `base-2`, `base-3`, … : the first one that is not taken. */
export function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export interface DeriveOptions {
  /** Ignore `config.id`: a new hall made in the constructor is named after its own name. */
  ignoreConfigId?: boolean;
}

/**
 * The id a new hall gets. `config.id` when it is given and free (an API client may choose its
 * ids); otherwise a slug of the name, made unique with a numeric suffix. An id that belongs to
 * another hall is never reused with a suffix: a copied file would otherwise look like a version of
 * the hall it came from.
 */
export function deriveHallId(
  config: Pick<HallConfig, 'id' | 'name'>,
  taken: ReadonlySet<string>,
  options: DeriveOptions = {},
): string {
  if (
    !options.ignoreConfigId &&
    config.id !== undefined &&
    config.id !== '' &&
    !taken.has(config.id)
  ) {
    return config.id;
  }
  return uniqueId(slugify(config.name) || 'hall', taken);
}
