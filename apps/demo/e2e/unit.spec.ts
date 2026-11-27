import { expect, test } from '@playwright/test';
import { buildHallLayout, templates } from '@cinema-hall/core';
import { MAX_BODY_BYTES, readBodyText } from '../lib/server/body-limit';
import { clockOffsetMs, remainingMs } from '../lib/shared/clock';
import { loadConsistent } from '../lib/shared/live-sync';
import { parsePrice, planSessions } from '../lib/shared/generator';
import { tierPrice, tiersOf } from '../lib/shared/hall-check';
import { thumbPlan } from '../lib/shared/thumb-plan';
import {
  isCreateHallResponse,
  isOccupancyResponse,
  isRepinResponse,
  isSaveResponse,
  isSessionsList,
  type TierView,
} from '../lib/shared/types';

/** Logic of `lib/` that needs no browser and no server: plain Playwright tests, no page. */

const TIERS: TierView[] = [
  { tier: 'standard', label: 'Classic', count: 10, color: '#5E636B', price: 450 },
];
const SLOT = { time: '10:00', format: '2D' };

test.describe('generator', () => {
  test('DEMO-02: a time that is not a string is rejected, not coerced', () => {
    const hostile: unknown = JSON.parse(
      '{"from":"2030-01-01","to":"2030-01-01","slots":[{"time":{"toString":null},"format":"2D"}]}',
    );
    const plan = planSessions('h', hostile, TIERS, '2026-01-01');
    expect(plan).toMatchObject({ ok: false, field: 'slots' });
    for (const time of [null, 5, [], { valueOf: null }]) {
      const result = planSessions(
        'h',
        { from: '2030-01-01', to: '2030-01-01', slots: [{ time, format: '2D' }] },
        TIERS,
        '2026-01-01',
      );
      expect(result.ok).toBe(false);
    }
  });

  test('DEMO-12: the last supported day is a one-day range; ranges cross month and year ends', () => {
    const last = planSessions(
      'h',
      { from: '9999-12-31', to: '9999-12-31', slots: [SLOT] },
      TIERS,
      '2026-01-01',
    );
    expect(last.ok && last.specs.map((spec) => spec.id)).toEqual(['h-99991231-1000']);
    const crossing = planSessions(
      'h',
      { from: '2026-12-30', to: '2027-01-02', slots: [SLOT] },
      TIERS,
      '2026-01-01',
    );
    expect(crossing.ok && crossing.specs.map((spec) => spec.date)).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
    const tooLong = planSessions(
      'h',
      { from: '2030-01-01', to: '2030-02-01', slots: [SLOT] },
      TIERS,
      '2026-01-01',
    );
    expect(tooLong).toMatchObject({ ok: false, field: 'to' });
  });

  test('prices: plain numbers with at most two decimals', () => {
    expect(parsePrice('450,5')).toBe(450.5);
    expect(parsePrice(0)).toBe(0);
    for (const bad of ['1.234', -1, 'abc', '', NaN, Infinity, 1e12, null, {}]) {
      expect(parsePrice(bad)).toBeNull();
    }
  });
});

test.describe('prices of tiers', () => {
  test('DEMO-08: a tier named like an Object.prototype member has no price, not a function', () => {
    const config = templates.single();
    const section = config.layout.bands[0]?.sections[0];
    if (!section) throw new Error('template has no section');
    section.priceTier = 'constructor';
    config.pricing = { tiers: { standard: 350 } };
    const layout = buildHallLayout(config);
    const tiers = tiersOf(layout);
    expect(tiers).toHaveLength(1);
    expect(tiers[0]?.tier).toBe('constructor');
    expect(tiers[0]?.price).toBeNull();
    for (const tier of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(tierPrice({ tiers: { standard: 350 } }, tier)).toBeNull();
    }
    expect(tierPrice({ tiers: { standard: 350 } }, 'standard')).toBe(350);
  });

  test('DEMO-08: an override for such a tier is a real override and is stored as an own property', () => {
    const tiers: TierView[] = [
      { tier: 'constructor', label: 'constructor', count: 1, color: '#000000', price: null },
    ];
    const plan = planSessions(
      'h',
      { from: '2030-01-01', to: '2030-01-01', slots: [SLOT], prices: { constructor: '12,5' } },
      tiers,
      '2026-01-01',
    );
    const pricing = plan.ok ? plan.specs[0]?.pricing : undefined;
    expect(Object.hasOwn(pricing?.tiers ?? {}, 'constructor')).toBe(true);
    expect(pricing?.tiers.constructor).toBe(12.5);
  });
});

test.describe('response guards', () => {
  test('DEMO-10: malformed payloads are refused', () => {
    expect(isOccupancyResponse({ occupancy: { taken: 5 } })).toBe(false);
    expect(isOccupancyResponse({ occupancy: { revision: 1, taken: 5 }, hallVersionRev: 1 })).toBe(
      false,
    );
    expect(isOccupancyResponse({ occupancy: { revision: 1 } })).toBe(false);
    expect(isSessionsList({ sessions: [null] })).toBe(false);
    expect(isRepinResponse({ ok: true })).toBe(false);
    expect(isSaveResponse({ ok: false, revision: 1 })).toBe(false);
    expect(isSaveResponse({ ok: false, reason: 'seats_in_use', revision: 1 })).toBe(false);
    expect(isCreateHallResponse({ ok: true })).toBe(false);
    expect(isCreateHallResponse({ ok: false })).toBe(false);
    expect(isCreateHallResponse(null)).toBe(false);
  });

  test('DEMO-10: well-formed payloads are accepted', () => {
    expect(
      isOccupancyResponse({
        occupancy: {
          revision: 3,
          serverNow: '2030-01-01T00:00:00.000Z',
          taken: ['a.r1.s1'],
          blocked: [],
          held: [{ key: 'a.r1.s2', mine: true, expiresAt: '2030-01-01T00:10:00.000Z' }],
        },
        hallVersionRev: 2,
        pricing: { tiers: { standard: 450 } },
      }),
    ).toBe(true);
    expect(
      isRepinResponse({
        ok: true,
        toRev: 2,
        moved: [{ sessionId: 's', fromRev: 1 }],
        refused: [{ sessionId: 't', keys: ['a.r1.s1'] }],
        unchanged: 0,
      }),
    ).toBe(true);
    expect(isRepinResponse({ ok: false, error: 'x', message: 'y' })).toBe(true);
    expect(
      isSaveResponse({
        ok: false,
        reason: 'conflict',
        revision: 2,
        server: { name: 'Hall' },
        source: 'name: Hall',
      }),
    ).toBe(true);
    expect(isSaveResponse({ ok: false, reason: 'seats_in_use', revision: 1, keys: ['a'] })).toBe(
      true,
    );
    expect(isSaveResponse({ ok: true, revision: 2 })).toBe(true);
  });
});

test.describe('request body limit', () => {
  const streamOf = (chunks: Uint8Array[]): Request => {
    let index = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks[index];
        index += 1;
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
    });
    // A stream has no Content-Length: only the bytes that arrive can be counted.
    const init: RequestInit & { duplex: 'half' } = { method: 'POST', body, duplex: 'half' };
    return new Request('http://localhost/x', init);
  };

  test('DEMO-03: a body without Content-Length is cut at the limit', async () => {
    const chunk = new Uint8Array(64 * 1024).fill(97);
    const chunks = Array.from(
      { length: Math.ceil(MAX_BODY_BYTES / chunk.length) + 2 },
      () => chunk,
    );
    expect(await readBodyText(streamOf(chunks))).toEqual({ ok: false, reason: 'too_large' });
    expect(await readBodyText(streamOf([chunk, chunk]))).toMatchObject({ ok: true });
  });

  test('DEMO-03: a false Content-Length does not help', async () => {
    const request = new Request('http://localhost/x', {
      method: 'POST',
      body: 'x'.repeat(100),
      headers: { 'content-length': '5' },
    });
    // The declared size is only a hint; here it is below the limit and the real body is read.
    expect(await readBodyText(request, 50)).toEqual({ ok: false, reason: 'too_large' });
  });

  test('DEMO-13: the envelope fits the doubled representation of a 256 KiB YAML', async () => {
    expect(MAX_BODY_BYTES).toBe(2 * 256 * 1024 + 64 * 1024);
    const yaml = '\n'.repeat(256 * 1024 - 1);
    const text = JSON.stringify({ yaml });
    expect(text.length).toBeLessThan(MAX_BODY_BYTES);
    const request = new Request('http://localhost/x', { method: 'POST', body: text });
    expect(await readBodyText(request)).toMatchObject({ ok: true });
  });
});

test.describe('server clock', () => {
  test('DEMO-11: the countdown follows the server clock, not the browser clock', () => {
    const serverNow = '2030-01-01T10:00:00.000Z';
    const expiresAt = '2030-01-01T10:10:00.000Z';
    const browserNow = Date.parse(serverNow) + 3_600_000; // the browser is an hour ahead
    const offset = clockOffsetMs(serverNow, browserNow);
    expect(remainingMs(expiresAt, browserNow, offset)).toBe(600_000);
    // Without the offset the hold would look expired at once.
    expect(remainingMs(expiresAt, browserNow, 0)).toBe(0);
    expect(remainingMs(expiresAt, browserNow + 601_000, offset)).toBe(0);
    expect(clockOffsetMs(undefined, browserNow)).toBe(0);
    expect(clockOffsetMs('not a date', browserNow)).toBe(0);
    expect(remainingMs(null, browserNow, 0)).toBeNull();
  });
});

test.describe('issues in a save response', () => {
  const invalid = (issue: unknown): unknown => ({
    ok: false,
    reason: 'invalid',
    revision: 1,
    issues: [issue],
  });
  const good = {
    severity: 'error',
    code: 'fit.width',
    path: ['layout', 'bands', 0, 'sections', 1],
  };

  test('DEMO-10: every field of an issue that the constructor reads is checked', () => {
    expect(isSaveResponse(invalid(good))).toBe(true);
    expect(
      isSaveResponse(
        invalid({
          ...good,
          params: { width: 11.5, id: 'x' },
          ref: { bandId: 'main', sectionId: 'left' },
          position: { line: 3, col: 7 },
        }),
      ),
    ).toBe(true);

    const hostileToString: unknown = JSON.parse('{"toString":null}');
    const bad: unknown[] = [
      { ...good, params: hostileToString },
      { ...good, params: { width: hostileToString } },
      { ...good, params: { width: NaN } },
      { ...good, params: [1] },
      { ...good, path: ['layout', hostileToString] },
      { ...good, path: ['layout', null] },
      { ...good, path: ['layout', Infinity] },
      { ...good, path: 'layout' },
      { ...good, ref: { sectionId: 5 } },
      { ...good, ref: 'left' },
      { ...good, position: { line: '3', col: 7 } },
      { ...good, position: { line: 3 } },
      { ...good, position: null },
      { ...good, severity: 'info' },
      { ...good, code: 5 },
    ];
    for (const issue of bad)
      expect(isSaveResponse(invalid(issue)), JSON.stringify(issue)).toBe(false);
  });
});

test.describe('live sync of a booking page', () => {
  type Snapshot = { hallVersionRev: number; tag: string };
  const sources = (snapshots: number[], configs: number[]) => {
    const calls: string[] = [];
    return {
      calls,
      sources: {
        fetchSnapshot: async (): Promise<Snapshot> => {
          const rev = snapshots.shift();
          if (rev === undefined) throw new Error('no more snapshots');
          calls.push(`occupancy v${rev}`);
          return { hallVersionRev: rev, tag: `s${rev}` };
        },
        fetchConfig: async () => {
          const rev = configs.shift();
          if (rev === undefined) throw new Error('no more configs');
          calls.push(`config v${rev}`);
          return { config: `c${rev}`, hallVersionRev: rev };
        },
      },
    };
  };

  test('DEMO-07: the same version needs no config', async () => {
    const { sources: src } = sources([1], []);
    expect(await loadConsistent(1, src)).toEqual({ snapshot: { hallVersionRev: 1, tag: 's1' } });
  });

  test('DEMO-07: a new version is committed together with its own config', async () => {
    const { sources: src } = sources([2], [2]);
    expect(await loadConsistent(1, src)).toEqual({
      snapshot: { hallVersionRev: 2, tag: 's2' },
      config: { config: 'c2', hallVersionRev: 2 },
    });
  });

  test('DEMO-07: occupancy v2 then a re-pin: v3 config is dropped with the v2 snapshot and the pair is fetched again', async () => {
    const { sources: src, calls } = sources([2, 3], [3, 3]);
    const result = await loadConsistent(1, src);
    expect(calls).toEqual(['occupancy v2', 'config v3', 'occupancy v3', 'config v3']);
    // Never the v3 map with v2 occupancy.
    expect(result).toEqual({
      snapshot: { hallVersionRev: 3, tag: 's3' },
      config: { config: 'c3', hallVersionRev: 3 },
    });
  });

  test('DEMO-07: a hall that keeps changing commits nothing', async () => {
    const { sources: src } = sources([2, 3, 4], [3, 4, 5]);
    expect(await loadConsistent(1, src, 3)).toBeNull();
  });
});

test.describe('hall plan thumbnail', () => {
  test('a two-level hall draws each level in its own block, the balcony below the stalls', () => {
    const layout = buildHallLayout(templates.balcony());
    const plan = thumbPlan(layout);
    expect(plan.blocks.map((block) => block.level)).toEqual([0, 1]);
    const [ground, balcony] = plan.blocks;
    expect(ground!.title).toBeNull();
    expect(ground!.offset).toBe(0);
    expect(balcony!.title).toBe('Balcony');
    expect(ground!.seats.length + balcony!.seats.length).toBe(layout.seats.length);
    const groundBottom = Math.max(...ground!.seats.map((seat) => seat.position.z + 0.45));
    const balconyTop = Math.min(
      ...balcony!.seats.map((seat) => seat.position.z - 0.3 + balcony!.offset),
    );
    expect(balcony!.dividerY!).toBeGreaterThan(groundBottom);
    expect(balcony!.titleY!).toBeGreaterThan(balcony!.dividerY!);
    expect(balconyTop).toBeGreaterThan(balcony!.titleY!);
    const box = plan.viewBox;
    expect(box.y + box.height).toBeGreaterThan(
      Math.max(...balcony!.seats.map((seat) => seat.position.z + balcony!.offset)),
    );
  });

  test('an unnamed upper level gets the given name; a one-level hall has one block', () => {
    const config = templates.balcony();
    delete config.layout.bands[2]!.label;
    const plan = thumbPlan(buildHallLayout(config), (level, upper) => `L${level}/${upper}`);
    expect(plan.blocks[1]!.title).toBe('L1/1');
    const flat = thumbPlan(buildHallLayout(templates.threeSections()));
    expect(flat.blocks).toHaveLength(1);
    expect(flat.blocks[0]!.dividerY).toBeNull();
  });
});

test.describe('templates in the demo', () => {
  test('a new hall from any template has a price for every seat type', () => {
    for (const config of [
      templates.single(),
      templates.threeSections(),
      templates.stadium(),
      templates.balcony(),
    ]) {
      const tiers = tiersOf(buildHallLayout(config));
      expect(tiers.every((tier) => tier.price !== null)).toBe(true);
    }
    const balconyTiers = tiersOf(buildHallLayout(templates.balcony()));
    expect(balconyTiers.map((tier) => tier.tier)).toEqual(['standard', 'recliner', 'balcony']);
    expect(balconyTiers.every((tier) => tier.label.trim() !== '')).toBe(true);
  });
});
