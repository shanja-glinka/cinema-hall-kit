import { describe, expect, it } from 'vitest';
import { suggestId } from '../src/index.js';
import { IdSchema } from '../src/schema.js';

/** Text from code points, so the test source stays ASCII. */
const text = (...codes: number[]): string => String.fromCodePoint(...codes);
/** Cyrillic words used as labels: "balcony", "lounge", "zone", "pike", "and", "hedgehog". */
const balkon = text(0x0411, 0x0430, 0x043b, 0x043a, 0x043e, 0x043d);
const launzh = text(0x041b, 0x0430, 0x0443, 0x043d, 0x0436);
const zona = text(0x0437, 0x043e, 0x043d, 0x0430);
const shchuka = text(0x0429, 0x0443, 0x043a, 0x0430);
const i = text(0x0438);
const ezh = text(0x0451, 0x0436);

describe('suggestId', () => {
  it.each([
    [balkon, 'balkon'],
    ['VIP', 'vip'],
    ['Sweet spot', 'sweet-spot'],
    [`  ${launzh} \u2014 ${zona} `, 'launzh-zona'],
    [`${shchuka} ${i} ${ezh}`, 'shchuka-i-ezh'],
    ['Café crème', 'cafe-creme'],
    ['-- Rear_row!', 'rear_row'],
    ['2nd level', '2nd-level'],
  ])('%s → %s', (label, id) => {
    expect(suggestId(label, [])).toBe(id);
  });

  it('adds -2, -3 on collision', () => {
    expect(suggestId('VIP', ['vip'])).toBe('vip-2');
    expect(suggestId('VIP', new Set(['vip', 'vip-2']))).toBe('vip-3');
  });

  it('uses the fallback for a label with nothing usable', () => {
    expect(suggestId('★★★', [])).toBe('item');
    expect(suggestId('', [], 'type')).toBe('type');
    expect(suggestId('!!!', ['type'], 'type')).toBe('type-2');
    expect(suggestId('', [], '***')).toBe('item');
  });

  it('always returns a valid id of at most 64 characters', () => {
    const long = `${balkon} ${launzh} ${zona} `.repeat(10);
    const first = suggestId(long, []);
    const second = suggestId(long, [first]);
    for (const id of [first, second]) {
      expect(IdSchema.safeParse(id).success).toBe(true);
      expect(id.length).toBeLessThanOrEqual(64);
    }
    expect(second).not.toBe(first);
    expect(second.endsWith('-2')).toBe(true);
  });
});
