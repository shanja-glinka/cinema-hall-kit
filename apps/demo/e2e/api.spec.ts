import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { MAX_BODY_BYTES } from '../lib/server/body-limit';

/** The backend routes, called directly: limits, malformed bodies, storage and conflicts. */

const ORBITA = readFileSync(
  fileURLToPath(new URL('../data/orbita-hall-2.yaml', import.meta.url)),
  'utf8',
);

const hallYaml = (id: string, name = 'API Hall'): string =>
  ORBITA.replace(/^id:.*$/m, `id: ${id}`).replace(/^name:.*$/m, `name: ${name}`);
const uniqueId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}`;

function dayFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${String(date.getDate()).padStart(2, '0')}`;
}

const generator = (time = '11:00') => ({
  from: dayFromNow(1),
  to: dayFromNow(1),
  slots: [{ time, format: '2D' }],
  occupancyPercent: 0,
});

interface Card {
  id: string;
  seats: number;
  tiers: { tier: string; price: number | null }[];
  sessions: {
    id: string;
    versionRev: number;
    prices: { tier: string; price: number | null; overridden: boolean }[];
  }[];
}

async function cards(request: APIRequestContext): Promise<Card[]> {
  const response = await request.get('/api/halls');
  expect(response.status()).toBe(200);
  return ((await response.json()) as { halls: Card[] }).halls;
}

async function createHall(request: APIRequestContext, id: string, yaml = hallYaml(id)) {
  const response = await request.post('/api/halls', { data: { yaml, generator: generator() } });
  expect(response.status()).toBe(201);
}

test('DEMO-01: a valid hall whose canonical JSON is larger than 256 KiB does not break the listing', async ({
  request,
}) => {
  const id = uniqueId('api-bulk');
  // About 140 KB as YAML, about 280 KB as JSON: valid input that used to be unreadable once stored.
  const bulk = `  bulk: [${'a,'.repeat(69_999)}a]`;
  const yaml = hallYaml(id).replace('hallType: LUX', `hallType: LUX\n${bulk}`);
  expect(Buffer.byteLength(yaml)).toBeLessThan(256 * 1024);
  await createHall(request, id, yaml);

  expect((await cards(request)).some((card) => card.id === id)).toBe(true);
  expect((await request.get(`/api/halls/${id}`)).status()).toBe(200);
  expect((await request.get(`/api/halls/${id}/sessions`)).status()).toBe(200);
  expect((await request.get('/')).status()).toBe(200);
  const session = (await cards(request)).find((card) => card.id === id)?.sessions[0];
  expect((await request.get(`/api/sessions/${session?.id}/occupancy`)).status()).toBe(200);
});

test('hall ids keep their legacy transliteration for non-Latin hall names', async ({ request }) => {
  const name = String.fromCodePoint(
    0x041a,
    0x0430,
    0x043c,
    0x0435,
    0x0440,
    0x043d,
    0x044b,
    0x0439,
    0x20,
    0x0437,
    0x0430,
    0x043b,
  );
  const yaml = ORBITA.replace(/^id:.*\n/m, '').replace(
    /^name:.*$/m,
    `name: ${JSON.stringify(name)}`,
  );
  const response = await request.post('/api/halls', { data: { yaml } });
  expect(response.status()).toBe(201);
  const result = (await response.json()) as { hall: { id: string; name: string } };
  expect(result.hall.id).toBe('kamernyy-zal');
  expect(result.hall.name).toBe(name);
});

test('DEMO-01: a refused creation leaves nothing behind', async ({ request }) => {
  const before = (await cards(request)).length;
  const id = uniqueId('api-atomic');
  const response = await request.post('/api/halls', {
    data: { yaml: hallYaml(id), generator: { ...generator(), occupancyPercent: 500 } },
  });
  expect(response.status()).toBe(400);
  expect((await cards(request)).length).toBe(before);
  expect((await request.get(`/api/halls/${id}`)).status()).toBe(404);
});

test('DEMO-02: a malformed generator is a 400 on both routes, never a 500', async ({ request }) => {
  const id = uniqueId('api-hostile');
  await createHall(request, id);
  const hostile = (base: object) => ({
    ...base,
    slots: [{ time: { toString: null }, format: '2D' }],
  });
  const create = await request.post('/api/halls', {
    data: { yaml: hallYaml(uniqueId('api-hostile-2')), generator: hostile(generator()) },
  });
  expect(create.status()).toBe(400);
  expect(((await create.json()) as { field: string }).field).toBe('slots');
  const add = await request.post(`/api/halls/${id}/sessions`, { data: hostile(generator()) });
  expect(add.status()).toBe(400);
  expect(((await add.json()) as { field: string }).field).toBe('slots');
});

test('DEMO-03: saving is limited as a whole and takes only its own fields', async ({ request }) => {
  const id = uniqueId('api-save');
  await createHall(request, id);
  const yaml = hallYaml(id);

  const extra = await request.post(`/api/halls/${id}`, {
    data: { baseRevision: 1, yaml, junk: 'x'.repeat(404_000) },
  });
  expect(extra.status()).toBe(400);

  const huge = await request.post(`/api/halls/${id}`, {
    data: JSON.stringify({ baseRevision: 1, yaml, pad: 'x'.repeat(MAX_BODY_BYTES) }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(huge.status()).toBe(413);

  const fine = await request.post(`/api/halls/${id}`, { data: { baseRevision: 1, yaml } });
  expect(fine.status()).toBe(200);
});

test('DEMO-04: a body that is not an object is not a request to move sessions', async ({
  request,
}) => {
  const id = uniqueId('api-repin');
  await createHall(request, id);
  const save = await request.post(`/api/halls/${id}`, {
    data: { baseRevision: 1, yaml: hallYaml(id).replace('standard: 450', 'standard: 470') },
  });
  expect(save.status()).toBe(200);

  for (const body of [
    'null',
    '[]',
    '5',
    '"x"',
    'true',
    '{"toRev":"2"}',
    '{"toRev":1.5}',
    '{"x":1}',
  ]) {
    const response = await request.post(`/api/halls/${id}/repin`, {
      data: body,
      headers: { 'Content-Type': 'application/json' },
    });
    expect(response.status(), body).toBe(400);
  }
  const card = (await cards(request)).find((entry) => entry.id === id);
  expect(card?.sessions.map((session) => session.versionRev)).toEqual([1]);

  const ok = await request.post(`/api/halls/${id}/repin`, { data: {} });
  expect(ok.status()).toBe(200);
  const moved = (await cards(request)).find((entry) => entry.id === id);
  expect(moved?.sessions.map((session) => session.versionRev)).toEqual([2]);
});

test('DEMO-05: a conflict carries the current YAML with its comments', async ({ request }) => {
  const id = uniqueId('api-conflict');
  await createHall(request, id);
  const first = await request.post(`/api/halls/${id}`, {
    data: { baseRevision: 1, yaml: hallYaml(id).replace('hallType: LUX', 'hallType: 2D') },
  });
  expect(first.status()).toBe(200);

  const stale = await request.post(`/api/halls/${id}`, {
    data: { baseRevision: 1, yaml: hallYaml(id) },
  });
  const body = (await stale.json()) as { ok: boolean; reason: string; source?: string };
  expect(body.reason).toBe('conflict');
  expect(body.source).toContain('# Cinema Hall Config');
  expect(body.source).toContain('hallType: 2D');
});

test('DEMO-08: a tier named like an Object.prototype member has no price anywhere', async ({
  request,
}) => {
  const id = uniqueId('api-proto');
  const yaml = hallYaml(id).replace(
    '        seatType: standard\n',
    '        seatType: standard\n        priceTier: constructor\n',
  );
  const response = await request.post('/api/halls', { data: { yaml, generator: generator() } });
  expect(response.status()).toBe(201);
  const card = (await cards(request)).find((entry) => entry.id === id);
  const tier = card?.tiers.find((entry) => entry.tier === 'constructor');
  expect(tier).toBeDefined();
  expect(tier?.price).toBeNull();
  const price = card?.sessions[0]?.prices.find((entry) => entry.tier === 'constructor');
  expect(price?.price).toBeNull();
  expect(price?.overridden).toBe(false);
});

test('DEMO-13: a YAML up to 256 KiB is accepted through the JSON envelope; one byte more is refused by the parser', async ({
  request,
}) => {
  const base = hallYaml(uniqueId('api-big'));
  const padded = (bytes: number): string => base + '\n'.repeat(bytes - Buffer.byteLength(base));

  // The reviewer's case: 166,337 bytes of YAML became 324,626 characters of JSON.
  const medium = await request.post('/api/halls', { data: { yaml: padded(166_337) } });
  expect(medium.status()).toBe(201);

  const limit = 256 * 1024;
  const exactBase = hallYaml(uniqueId('api-exact'));
  const exact = await request.post('/api/halls', {
    data: { yaml: exactBase + '\n'.repeat(limit - Buffer.byteLength(exactBase)) },
  });
  expect(exact.status()).toBe(201);

  const over = await request.post('/api/halls', {
    data: { yaml: padded(limit + 1) },
  });
  expect(over.status()).toBe(400);
  const body = (await over.json()) as { issues: { code: string }[] };
  expect(body.issues.some((issue) => issue.code === 'schema.tooLarge')).toBe(true);
});

test('demo purchase: malformed bodies and unknown holds are refused, never a 500', async ({
  request,
}) => {
  const malformed = await request.post('/api/sessions/sat-1610/purchase', { data: { x: 1 } });
  expect(malformed.status()).toBe(400);
  const unknown = await request.post('/api/sessions/sat-1610/purchase', {
    data: { holdId: 'no-such-hold' },
  });
  expect(unknown.status()).toBe(409);
  expect(((await unknown.json()) as { reason: string }).reason).toBe('not_found');
});

test('demo purchase: the seats to buy must be a list of seat keys of the hold', async ({
  request,
}) => {
  for (const keys of ['main.r1.s1', [], [1], Array.from({ length: 21 }, (_, i) => `k${i}`)]) {
    const response = await request.post('/api/sessions/sat-1610/purchase', {
      data: { holdId: 'no-such-hold', keys },
    });
    expect(response.status(), JSON.stringify(keys)).toBe(400);
  }
  const unknown = await request.post('/api/sessions/sat-1610/purchase', {
    data: { holdId: 'no-such-hold', keys: ['main.r1.s1'] },
  });
  expect(unknown.status()).toBe(409);
});
