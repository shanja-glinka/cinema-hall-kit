/** The demo's own texts, the sample hall wording and the two-level Grand Hall. */
import { expect, test } from '@playwright/test';
import {
  buildHallLayout,
  formatIssue,
  issueMessages,
  parseHallConfig,
  validateHall,
  type Issue,
} from '@cinema-hall/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dateLabel, dateOption, dateShort, showtimeLabel } from '../lib/shared/dates';
import { planSessions, formOccupancyPercent } from '../lib/shared/generator';
import { checkHallText, describePath, toIssueView } from '../lib/shared/hall-check';
import { copyName } from '../lib/shared/hall-text';
import { templateChoices } from '../lib/shared/templates';
import { LOCALE, t } from '../lib/shared/texts';
import type { TierView, HallCard } from '../lib/shared/types';
import {
  bandText,
  seatTypeText,
  withCardTexts,
  withSampleTexts,
  sampleTextsFor,
} from '../lib/shared/sample-texts';
import { db } from '../lib/server/store';

/** Every text of the demo, with sample arguments for the functions. */
function textsOf(value: unknown, path = ''): { path: string; text: string }[] {
  if (typeof value === 'string') return [{ path, text: value }];
  if (typeof value === 'function') {
    const args = Array.from({ length: value.length }, (_, index) => (index === 0 ? 'X' : 2));
    return [{ path, text: String((value as (...a: unknown[]) => unknown)(...args)) }];
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, entry]) => textsOf(entry, `${path}.${key}`));
  }
  return [];
}

const TIERS: TierView[] = [
  { tier: 'standard', label: 'Classic', count: 10, color: '#5E636B', price: 450 },
];

function sample(file: string) {
  const text = readFileSync(join(process.cwd(), 'data', file), 'utf8');
  const parsed = parseHallConfig(text, { format: 'yaml', strict: true });
  if (!parsed.ok) throw new Error(`${file} is not a valid hall`);
  return parsed.config;
}

const kamerny = (): string => {
  const source = db().versions.get('kamerny-hall@1')?.source;
  if (!source) throw new Error('no sample hall');
  return source;
};

test.describe('texts', () => {
  test('no text is empty', () => {
    for (const { path, text } of textsOf(t)) {
      expect(text.trim(), path).not.toBe('');
    }
  });

  test('plurals', () => {
    expect(t.common.showtimes(1)).toBe('1 showtime');
    expect(t.common.showtimes(3)).toBe('3 showtimes');
  });

  test('the picker button reserves seats', () => {
    expect(t.booking.reserveButton).toBe('Reserve seats · {price}');
  });

  test('dates use Intl with en-US', () => {
    expect(LOCALE).toBe('en-US');
    expect(dateShort('2026-11-28')).toBe('Nov 28');
    expect(dateOption('2026-11-28')).toBe('Sat, Nov 28');
    expect(dateLabel('2026-11-28')).toBe('Sat, November 28');
    expect(showtimeLabel('2026-11-28', '18:30')).toBe('Nov 28 · 18:30');
  });

  test('generator messages', () => {
    const input = {
      from: '2030-01-02',
      to: '2030-01-01',
      slots: [{ time: '10:00', format: '2D' }],
    };
    expect(planSessions('h', input, TIERS, '2026-01-01')).toMatchObject({
      ok: false,
      field: 'to',
      message: t.generator.endBeforeStart,
    });
  });

  test('issue texts use the core catalog, places use the demo words', () => {
    expect(checkHallText('')).toMatchObject({ ok: false, errors: [{ text: t.issues.empty }] });
    expect(describePath(['layout', 'bands', 0, 'sections', 1, 'seatsPerRow'])).toBe(
      'Seating area 1 › section 2 › seats per row',
    );
    const issue: Issue = {
      severity: 'error',
      code: 'fit.width',
      path: ['hall', 'width'],
      params: { required: 20, actual: 10 },
    };
    const view = toIssueView(issue);
    expect(view.text).toBe(formatIssue(issue, issueMessages.en, LOCALE));
    expect(view.place).toBe('Hall size and colours › width');
    expect(toIssueView({ ...issue, position: { line: 3, col: 7 } }).position).toBe(
      'line 3, column 7',
    );
  });

  test('template names and copy names', () => {
    const choices = templateChoices([{ id: 'single', label: 'Single block' }]);
    expect(choices).toEqual([{ id: 'single', ...t.templates.single }]);
    expect(copyName('Grand Hall')).toBe('Grand Hall (copy)');
    expect(copyName('Grand Hall (copy)')).toBe('Grand Hall (copy)');
  });
});

test.describe('Grand Hall', () => {
  test('is a true two-level hall: its balcony hangs over the rear rows, with no issues', () => {
    const text = readFileSync(join(process.cwd(), 'data', 'bolshoy-hall.yaml'), 'utf8');
    const parsed = parseHallConfig(text, { format: 'yaml', strict: true });
    expect(validateHall(parsed.config, { enforce: true })).toEqual([]);
    const layout = buildHallLayout(parsed.config);
    expect(layout.seats).toHaveLength(228);
    const balcony = layout.bands.find((band) => band.id === 'balcony');
    expect(balcony).toMatchObject({ level: 1, overhang: true, label: 'Balcony' });
    const below = layout.bands.filter((band) => band.level === 0);
    expect(below.length).toBeGreaterThan(0);
    // The balcony starts above the ground-floor rows, not behind them.
    const rear = Math.max(...below.map((band) => band.maxZ));
    expect(balcony?.minZ ?? Infinity).toBeLessThan(rear);
    expect(layout.seats.filter((seat) => seat.level === 1)).toHaveLength(54);
  });
});

test.describe('sample texts', () => {
  test('premium seats of the samples say what they are', () => {
    expect(seatTypeText('recliner', 'Lounge')).toBe('Lounge (recliners)');
    expect(seatTypeText('recliner', 'Lounge (recliners)')).toBe('Lounge (recliners)');
    expect(seatTypeText('standard', 'Classic')).toBe('Classic');
    // The band of those seats keeps its short name.
    expect(bandText('lounge', 'Lounge (recliners)')).toBe('Lounge');
  });

  test('a name the administrator typed is never replaced', () => {
    expect(seatTypeText('recliner', 'VIP')).toBe('VIP');
    expect(seatTypeText('premium', 'Lounge')).toBe('Lounge');
    expect(bandText('lounge', 'Back rows')).toBe('Back rows');
    expect(bandText('stalls', undefined)).toBeUndefined();
  });

  test('the sample halls: current wording, and the same object when nothing changes', () => {
    const grand = sample('bolshoy-hall.yaml');
    const shown = withSampleTexts(grand);
    expect(parseHallConfig(shown).ok).toBe(true);
    for (const [id, type] of Object.entries(shown.seatTypes)) {
      expect(type.label).toBe(seatTypeText(id, type.label));
    }
    expect(withSampleTexts(shown)).toBe(shown);
    const orbita = sample('orbita-hall-2.yaml');
    expect(withSampleTexts(orbita).viewingZones?.map((zone) => zone.label)).toEqual(
      orbita.viewingZones?.map((zone) => zone.label),
    );
  });

  test('a hall card gets the current labels of its tiers and showtime prices', () => {
    const card = {
      id: 'x',
      name: 'X',
      sample: true,
      currentRev: 1,
      seats: 10,
      tiers: [{ tier: 'recliner', label: 'Lounge', count: 2, color: '#fff', price: 650 }],
      sessions: [
        {
          id: 's',
          hallId: 'x',
          date: '2026-11-28',
          dateLabel: '',
          dateShort: '',
          time: '19:00',
          format: '2D',
          versionRev: 1,
          occupancyPercent: 0,
          prices: [{ tier: 'recliner', label: 'Lounge', price: 650, overridden: false }],
        },
      ],
      outdatedSessions: 0,
    } satisfies HallCard;
    const shown = withCardTexts(card);
    expect(shown.tiers[0]?.label).toBe('Lounge (recliners)');
    expect(shown.sessions[0]?.prices[0]?.label).toBe('Lounge (recliners)');
  });
});

test.describe('older sample wording only in sample halls', () => {
  const lounge = () => {
    const config = parseHallConfig(kamerny(), { strict: true }).config;
    return {
      ...config,
      seatTypes: {
        ...config.seatTypes,
        recliner: { ...config.seatTypes.standard!, label: 'Lounge' },
      },
    };
  };

  test('a hall someone made keeps a recliner seat type named "Lounge"', () => {
    const custom = lounge();
    expect(sampleTextsFor(custom, false)).toBe(custom);
    expect(sampleTextsFor(custom, true).seatTypes.recliner?.label).toBe('Lounge (recliners)');
  });

  test('a card of a hall someone made keeps its tier labels', () => {
    const card = {
      id: 'x',
      name: 'X',
      currentRev: 1,
      seats: 10,
      tiers: [{ tier: 'recliner', label: 'Lounge', count: 2, color: '#fff', price: 650 }],
      sessions: [],
      outdatedSessions: 0,
    } satisfies HallCard;
    expect(withCardTexts(card)).toBe(card);
  });
});

test.describe('showtime form texts', () => {
  test('one day is one showtime per time', () => {
    const plan = planSessions(
      'h',
      { from: '2099-01-01', to: '2099-01-01', slots: [{ time: '19:00', format: '2D' }] },
      [],
      '2098-12-31',
    );
    expect(plan.ok && plan.specs.length).toBe(1);
  });

  test('the booking page says the seats are reserved', () => {
    expect(t.booking.reservedFor('9:59')).toBe('Seats reserved for 9:59');
    expect(t.booking.reserved).toBe('Seats reserved');
  });

  test('the pretend sales are explained as a demo simulation', () => {
    expect(t.showtimeForm.demoSimulation).toContain('Demo simulation');
    expect(t.showtimeForm.demoSimulationText).toContain('Leave 0');
  });
});

test.describe('showtime form: a blank "seats occupied" field', () => {
  const TIERS = [{ tier: 'standard', label: 'Standard', price: { amount: 500, currency: 'USD' } }];
  test('means no pretend sales, not the API default', () => {
    expect(formOccupancyPercent('')).toBe('0');
    expect(formOccupancyPercent('  ')).toBe('0');
    expect(formOccupancyPercent('25')).toBe('25');
    expect(formOccupancyPercent('abc')).toBe('abc');
    const plan = planSessions(
      'h',
      {
        from: '2026-01-02',
        to: '2026-01-02',
        slots: [{ time: '12:00', format: '2D' }],
        occupancyPercent: formOccupancyPercent(''),
      },
      TIERS as never,
      '2026-01-01',
    );
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.specs.every((spec) => spec.occupancyPercent === 0)).toBe(true);
  });
});
