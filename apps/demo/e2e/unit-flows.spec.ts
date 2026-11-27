/** Logic behind the new-hall, showtime and purchase flows: no browser, no server. */
import { expect, test } from '@playwright/test';
import { bookSeats, getOccupancyResponse, purchaseInSession } from '../lib/server/booking';
import { createHall } from '../lib/server/halls';
import { repinHall } from '../lib/server/sessions';
import { HOLD_TTL_MS, db, findSession, makeSession, makeVersion } from '../lib/server/store';
import { dateOption, dateShort, showtimeLabel } from '../lib/shared/dates';
import { checkHallText, describePath } from '../lib/shared/hall-check';
import { deriveHallId, slugify } from '../lib/shared/hall-id';
import { templateChoices } from '../lib/shared/templates';
import { isCreateHallResponse, isPurchaseResult, isRepinResponse } from '../lib/shared/types';

test.describe('hall ids', () => {
  test('the document id is used when free; a taken id falls back to the name, not to id-2', () => {
    const taken = new Set(['orbita-hall-2', 'my-hall']);
    expect(deriveHallId({ id: 'fresh', name: 'Fresh' }, taken)).toBe('fresh');
    expect(deriveHallId({ id: 'orbita-hall-2', name: 'Aurora' }, taken)).toBe('aurora');
    expect(deriveHallId({ id: 'orbita-hall-2', name: 'My Hall' }, taken)).toBe('my-hall-2');
    expect(deriveHallId({ name: 'Orbita Hall 2' }, taken)).toBe('orbita-hall-2-2');
  });

  test('a new hall from the constructor ignores the document id', () => {
    expect(
      deriveHallId({ id: 'free-id', name: 'Aurora' }, new Set(), { ignoreConfigId: true }),
    ).toBe('aurora');
    expect(slugify('  Grand Hall #2 ')).toBe('grand-hall-2');
    expect(deriveHallId({ name: '***' }, new Set())).toBe('hall');
  });
});

test.describe('issue places', () => {
  test('paths are described in words', () => {
    expect(describePath(['layout', 'bands', 0, 'sections', 1, 'seatsPerRow'])).toBe(
      'Seating area 1 › section 2 › seats per row',
    );
    expect(describePath(['layout', 'bands', 1, 'defaults', 'rowSpacing'])).toBe(
      'Seating area 2 › row spacing',
    );
    expect(describePath(['hall', 'depth'])).toBe('Hall size and colours › depth');
    expect(describePath(['seatTypes', 'vip', 'width'])).toBe('Seat type “vip” › width');
    expect(describePath([])).toBe('');
  });
});

test.describe('dates', () => {
  test('one format everywhere', () => {
    expect(dateShort('2026-11-28')).toBe('Nov 28');
    expect(dateOption('2026-11-28')).toBe('Sat, Nov 28');
    expect(showtimeLabel('2026-11-28', '18:30')).toBe('Nov 28 · 18:30');
  });
});

test.describe('templates', () => {
  test('the two-level template is offered only when the library has it', () => {
    const base = [
      { id: 'threeSections', label: 'Three' },
      { id: 'single', label: 'Single' },
      { id: 'stadium', label: 'Stadium' },
    ];
    expect(templateChoices(base).map((choice) => choice.id)).toEqual([
      'single',
      'threeSections',
      'stadium',
    ]);
    const withBalcony = templateChoices([...base, { id: 'balcony', label: 'Balcony' }]);
    expect(withBalcony.map((choice) => choice.title)).toContain('Two levels');
    const withOther = templateChoices([...base, { id: 'arena', label: 'Arena' }]);
    expect(withOther.at(-1)).toEqual({ id: 'arena', title: 'Arena', description: '' });
  });
});

test.describe('creating halls', () => {
  const sampleSource = (): string => {
    const hall = db().halls.get('orbita-hall-2');
    const version = hall ? db().versions.get(hall.currentVersionId) : undefined;
    if (!version) throw new Error('no sample hall');
    return version.source;
  };

  test('the sample halls are marked and open without errors or warnings', () => {
    for (const id of ['orbita-hall-2', 'kamerny-hall', 'bolshoy-hall']) {
      expect(db().halls.get(id)?.sample).toBe(true);
      const check = checkHallText(db().versions.get(`${id}@1`)?.source ?? '', { enforce: true });
      expect(check, id).toMatchObject({ ok: true, warnings: [] });
    }
  });

  test('a file with a taken id becomes a new hall named after itself; the sample is untouched', () => {
    const before = db().halls.get('orbita-hall-2')?.currentVersionId;
    const name = `Aurora ${Date.now().toString(36)}`;
    const outcome = createHall({ yaml: sampleSource().replace(/^name:.*$/m, `name: ${name}`) });
    expect(outcome.status).toBe(201);
    expect(isCreateHallResponse(outcome.body)).toBe(true);
    if (!outcome.body.ok) throw new Error(outcome.body.message);
    expect(outcome.body.requestedId).toBe('orbita-hall-2');
    expect(outcome.body.hall.id).toBe(slugify(name));
    expect(outcome.body.hall.sample).toBeUndefined();
    const stored = db().versions.get(`${outcome.body.hall.id}@1`);
    expect(stored?.config.id).toBe(outcome.body.hall.id);
    // The note at the end of the id line stays with the new id.
    expect(stored?.source).toMatch(
      new RegExp(`^id: ${outcome.body.hall.id} # optional: the host database owns`, 'm'),
    );
    expect(db().halls.get('orbita-hall-2')?.currentVersionId).toBe(before);
  });

  test('asNew with a name: id from the name, own header, the original keeps its own', () => {
    const name = `Copy ${Date.now().toString(36)}`;
    const outcome = createHall({ yaml: sampleSource(), name, asNew: true });
    if (!outcome.body.ok) throw new Error(outcome.body.message);
    expect(outcome.body.hall.name).toBe(name);
    const stored = db().versions.get(`${outcome.body.hall.id}@1`);
    expect(stored?.source.split('\n')[0]).toBe(`# Cinema Hall Config — ${name}.`);
    expect(stored?.source).not.toContain('Orbita Hall 2:');
    expect(db().halls.get('orbita-hall-2')?.name).toBe('Orbita Hall 2');
  });

  test('an empty name is refused', () => {
    expect(createHall({ yaml: sampleSource(), name: '  ' }).status).toBe(400);
  });
});

test.describe('demo purchase', () => {
  const NOW = Date.now();

  function freshSession(id: string) {
    const hall = db().halls.get('kamerny-hall');
    if (!hall) throw new Error('no hall');
    const session = makeSession(hall, {
      id,
      date: '2099-01-01',
      time: '12:00',
      format: '2D',
      occupancyPercent: 0,
    });
    db().sessions.set(id, session);
    return session;
  }

  function hold(sessionId: string, viewerId: string, keys: string[], now = NOW): string {
    const result = bookSeats({
      sessionId,
      viewerId,
      keys,
      attemptId: `a-${Math.random()}`,
      prices: keys.map((key) => ({ key, price: 350 })),
      now,
    });
    if (!result.ok) throw new Error(JSON.stringify(result));
    return (result.data as { holdId: string }).holdId;
  }

  test('a hold becomes sold seats and a ticket; repeating returns the same ticket', () => {
    const session = freshSession(`unit-buy-${Date.now()}`);
    const holdId = hold(session.id, 'viewer-a', ['main.r1.s1', 'main.r1.s2']);
    const first = purchaseInSession(session, 'viewer-a', holdId, NOW + 1000);
    expect(isPurchaseResult(first)).toBe(true);
    if (!first.ok) throw new Error(first.message);
    expect(first.ticket.number).toMatch(/^T-[0-9A-F]{8}$/);
    expect(first.ticket.seats).toEqual(['A1', 'A2']);
    expect(first.ticket.total).toBe(700);
    const again = purchaseInSession(session, 'viewer-a', holdId, NOW + 2000);
    expect(again).toEqual(first);

    const occupancy = getOccupancyResponse(session.id, 'viewer-b', NOW + 3000)?.occupancy;
    expect(occupancy?.taken).toEqual(expect.arrayContaining(['main.r1.s1', 'main.r1.s2']));
    expect(occupancy?.held ?? []).toHaveLength(0);
    // A sold seat cannot be held again.
    const retry = bookSeats({
      sessionId: session.id,
      viewerId: 'viewer-b',
      keys: ['main.r1.s1'],
      attemptId: 'b-1',
      prices: [{ key: 'main.r1.s1', price: 350 }],
      now: NOW + 4000,
    });
    expect(retry).toMatchObject({ ok: false, reason: 'conflict' });
  });

  test('an expired hold and another viewer are refused, and nothing is sold', () => {
    const session = freshSession(`unit-expired-${Date.now()}`);
    const holdId = hold(session.id, 'viewer-a', ['main.r2.s5']);
    expect(purchaseInSession(session, 'viewer-b', holdId, NOW + 1000)).toMatchObject({
      ok: false,
      reason: 'not_found',
    });
    expect(purchaseInSession(session, 'viewer-a', holdId, NOW + HOLD_TTL_MS + 1)).toMatchObject({
      ok: false,
      reason: 'expired',
    });
    expect(session.sold.size).toBe(0);
    expect(purchaseInSession(session, 'viewer-a', 'no-such-hold', NOW)).toMatchObject({
      ok: false,
      reason: 'not_found',
    });
  });

  test('only the confirmed seats are sold and charged; the rest of the hold is released', () => {
    const session = freshSession(`unit-part-${Date.now()}`);
    const holdId = hold(session.id, 'viewer-a', ['main.r1.s1', 'main.r1.s2']);
    const bought = purchaseInSession(session, 'viewer-a', holdId, NOW + 1000, ['main.r1.s1']);
    if (!bought.ok) throw new Error(bought.message);
    expect(bought.ticket.keys).toEqual(['main.r1.s1']);
    expect(bought.ticket.seats).toEqual(['A1']);
    expect(bought.ticket.total).toBe(350);
    expect([...session.sold.keys()]).toEqual(['main.r1.s1']);
    expect(session.holds.has('main.r1.s2')).toBe(false);
    const occupancy = getOccupancyResponse(session.id, 'viewer-b', NOW + 2000)?.occupancy;
    expect(occupancy?.taken).toContain('main.r1.s1');
    expect(occupancy?.taken ?? []).not.toContain('main.r1.s2');
    expect((occupancy?.held ?? []).map((item) => item.key)).not.toContain('main.r1.s2');
    // The same request again gets the same ticket; other seats were never part of it.
    expect(purchaseInSession(session, 'viewer-a', holdId, NOW + 3000, ['main.r1.s1'])).toEqual(
      bought,
    );
    expect(
      purchaseInSession(session, 'viewer-a', holdId, NOW + 3000, ['main.r1.s1', 'main.r1.s2']),
    ).toMatchObject({ ok: false, reason: 'not_found' });
  });

  test('seats outside the hold, or no seats at all, are refused and nothing is sold', () => {
    const session = freshSession(`unit-outside-${Date.now()}`);
    const holdId = hold(session.id, 'viewer-a', ['main.r1.s1', 'main.r1.s2']);
    for (const keys of [['main.r1.s1', 'main.r1.s3'], ['main.r1.s3'], []]) {
      expect(purchaseInSession(session, 'viewer-a', holdId, NOW + 1000, keys)).toMatchObject({
        ok: false,
        reason: 'not_found',
      });
    }
    expect(session.sold.size).toBe(0);
    expect(session.holds.get('main.r1.s2')?.id).toBe(holdId);
  });

  test('a partial purchase that would leave a lone seat is refused; nothing is sold or released', () => {
    const session = freshSession(`unit-gap-${Date.now()}`);
    const holdId = hold(session.id, 'viewer-a', ['main.r1.s1', 'main.r1.s2', 'main.r1.s3']);
    // s2 is released and sits alone between the bought s1 and s3.
    const refused = purchaseInSession(session, 'viewer-a', holdId, NOW + 1000, [
      'main.r1.s1',
      'main.r1.s3',
    ]);
    expect(refused).toMatchObject({
      ok: false,
      reason: 'selection_rule',
      rule: 'noSingleGap',
    });
    expect(isPurchaseResult(refused)).toBe(true);
    expect(session.sold.size).toBe(0);
    for (const key of ['main.r1.s1', 'main.r1.s2', 'main.r1.s3']) {
      expect(session.holds.get(key)?.id).toBe(holdId);
    }
    // The hold is untouched, so a subset without a lone seat still goes through.
    const ok = purchaseInSession(session, 'viewer-a', holdId, NOW + 2000, [
      'main.r1.s1',
      'main.r1.s2',
    ]);
    expect(ok).toMatchObject({ ok: true });
    expect([...session.sold.keys()]).toEqual(['main.r1.s1', 'main.r1.s2']);
  });

  test("a partial purchase counts another viewer's held seats when it looks for a lone seat", () => {
    const session = freshSession(`unit-gap-other-${Date.now()}`);
    const mine = hold(session.id, 'viewer-a', ['main.r1.s3', 'main.r1.s4']);
    hold(session.id, 'viewer-b', ['main.r1.s5']);
    // Buying s3 alone would leave s4 between the bought s3 and the held s5.
    expect(purchaseInSession(session, 'viewer-a', mine, NOW + 1000, ['main.r1.s3'])).toMatchObject({
      ok: false,
      reason: 'selection_rule',
      rule: 'noSingleGap',
    });
    expect(session.sold.size).toBe(0);
    expect(session.holds.get('main.r1.s4')?.id).toBe(mine);
    // Buying s4 alone is fine: s3 is left at the edge of a free run, next to nothing held.
    expect(purchaseInSession(session, 'viewer-a', mine, NOW + 2000, ['main.r1.s4'])).toMatchObject({
      ok: true,
    });
  });

  test('buying the whole hold is not refused for the seats around it', () => {
    const session = freshSession(`unit-whole-${Date.now()}`);
    const mine = hold(session.id, 'viewer-a', ['main.r1.s3', 'main.r1.s4']);
    hold(session.id, 'viewer-b', ['main.r1.s5']);
    expect(purchaseInSession(session, 'viewer-a', mine, NOW + 1000)).toMatchObject({ ok: true });
    expect([...session.sold.keys()].sort()).toEqual(['main.r1.s3', 'main.r1.s4']);
  });

  test('purchase results are checked on the wire', () => {
    expect(isPurchaseResult({ ok: true })).toBe(false);
    expect(isPurchaseResult({ ok: false, reason: 'other', message: 'x' })).toBe(false);
    expect(isPurchaseResult({ ok: false, reason: 'expired', message: 'x' })).toBe(true);
  });
});

test.describe('moving showtimes', () => {
  test('a refusal names the showtime and the seat labels', () => {
    const id = `unit-repin-${Date.now().toString(36)}`;
    const created = createHall({
      yaml: db().versions.get('kamerny-hall@1')?.source ?? '',
      name: id,
      asNew: true,
    });
    if (!created.body.ok) throw new Error(created.body.message);
    const hall = db().halls.get(created.body.hall.id);
    if (!hall) throw new Error('no hall');
    const session = makeSession(hall, {
      id: `${hall.id}-s`,
      date: '2099-01-01',
      time: '18:30',
      format: '2D',
      occupancyPercent: 0,
    });
    db().sessions.set(session.id, session);
    session.sold.set('main.r6.s10', 'T-1');

    // Version 2 has nine seats per row: seat 10 of every row disappears.
    const current = db().versions.get(hall.currentVersionId);
    if (!current) throw new Error('no version');
    const config = structuredClone(current.config);
    const section = config.layout.bands[0]?.sections[0];
    if (!section) throw new Error('no section');
    section.seatsPerRow = 9;
    const next = makeVersion(hall.id, 2, config, current.source);
    db().versions.set(next.id, next);
    hall.versionIds.push(next.id);
    hall.currentVersionId = next.id;

    const outcome = repinHall(hall.id, undefined);
    expect(isRepinResponse(outcome.body)).toBe(true);
    if (!outcome.body.ok) throw new Error(outcome.body.message);
    expect(outcome.body.refused).toEqual([
      {
        sessionId: session.id,
        keys: ['main.r6.s10'],
        showtime: 'Jan 1 · 18:30',
        seats: ['F10'],
        retryable: false,
      },
    ]);
    expect(findSession(session.id)?.hallVersionId).toBe(`${hall.id}@1`);
  });
});
