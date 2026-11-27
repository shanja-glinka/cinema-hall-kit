/**
 * Latin spelling of the Cyrillic letters U+0430 (a) to U+044F (ya), in code point order, for ids
 * made from labels written in Cyrillic letters. Written as code points so the source stays ASCII.
 */
const CYRILLIC_BASIC = [
  'a',
  'b',
  'v',
  'g',
  'd',
  'e',
  'zh',
  'z',
  'i',
  'y',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
  'r',
  's',
  't',
  'u',
  'f',
  'kh',
  'ts',
  'ch',
  'sh',
  'shch',
  '',
  'y',
  '',
  'e',
  'yu',
  'ya',
] as const;

/** Latin spelling of other Cyrillic letters, by code point: yo, Ukrainian i, yi, ye, ghe and short u. */
const CYRILLIC_EXTRA: Readonly<Record<number, string>> = {
  0x0451: 'e',
  0x0456: 'i',
  0x0457: 'yi',
  0x0454: 'ye',
  0x0491: 'g',
  0x045e: 'u',
};

/** The Latin spelling of one lowercase character, or the character itself. */
function latinOf(char: string): string {
  const code = char.codePointAt(0)!;
  if (code >= 0x0430 && code <= 0x044f) return CYRILLIC_BASIC[code - 0x0430]!;
  return CYRILLIC_EXTRA[code] ?? char;
}

/** Longest id `IdSchema` accepts. */
const MAX_ID_LENGTH = 64;

/** Lowercase, Latin letters, digits, `-` and `_`, starting with a letter or digit; may be empty. */
function slug(text: string): string {
  const latin = Array.from(text.toLowerCase(), latinOf).join('');
  return latin
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .slice(0, MAX_ID_LENGTH)
    .replace(/[-_]+$/, '');
}

/**
 * Turns a human label into an id that `IdSchema` accepts and that is not in `taken`: Cyrillic is
 * written in Latin letters, the text is lowercased, spaces become `-`, other symbols are dropped
 * and the id starts with a letter or digit. When that id is taken, `-2`, `-3`, … is added. A label
 * with nothing usable gives `fallback` (itself cleaned the same way, or `item`). Ids are compared
 * exactly, as `IdSchema` ids are case-sensitive.
 *
 * @example
 * ```ts
 * suggestId('Grand Hall', []);          // 'grand-hall'
 * suggestId('\u0411\u0430\u043b\u043a\u043e\u043d', []); // 'balkon': Cyrillic written in Latin letters
 * suggestId('VIP', ['vip']);            // 'vip-2'
 * suggestId('★', [], 'type');           // 'type'
 * ```
 */
export function suggestId(label: string, taken: Iterable<string>, fallback = 'item'): string {
  const used = new Set(taken);
  const base = slug(label) || slug(fallback) || 'item';
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, MAX_ID_LENGTH - suffix.length).replace(/[-_]+$/, '')}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
