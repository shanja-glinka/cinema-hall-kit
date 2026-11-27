/** Rewriting the id and name of a hall text without changing anything else in it: no browser, no server. */
import { expect, test } from '@playwright/test';
import { parseHallConfig, serializeHallConfig } from '@cinema-hall/core';
import { createHall, saveHall, getHallResponse } from '../lib/server/halls';
import { db } from '../lib/server/store';
import {
  copyName,
  hallHeader,
  prepareCopy,
  replaceHeaderComment,
  setTopLevelField,
  yamlScalar,
  trailingComment,
  prepareCopyWithin,
} from '../lib/shared/hall-text';
import { MAX_STORED_YAML_BYTES, MAX_YAML_BYTES } from '../lib/server/body-limit';

const YAML = `# Cinema Hall Config — Orbita Hall 2: a sample.
# Units: metres.

version: 1
id: orbita-hall-2 # optional
name: Orbita Hall 2
hall:
  width: 9
`;

const kamerny = (): string => {
  const source = db().versions.get('kamerny-hall@1')?.source;
  if (!source) throw new Error('no sample hall');
  return source;
};

const unique = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const configOf = (version: string): Record<string, unknown> => {
  const text = db().versions.get(version)?.source;
  if (!text) throw new Error(`no sample hall ${version}`);
  const parsed = parseHallConfig(text, { format: 'yaml' });
  if (!parsed.ok) throw new Error('not a valid hall');
  return parsed.config as unknown as Record<string, unknown>;
};

const bytes = (text: string): number => Buffer.byteLength(text);

const parseConfig = (text: string): Record<string, unknown> => {
  const parsed = parseHallConfig(text, { format: 'yaml', maxBytes: Number.MAX_SAFE_INTEGER });
  if (!parsed.ok) throw new Error('not a valid hall');
  return parsed.config as unknown as Record<string, unknown>;
};

/** A hall written as one YAML flow mapping, `{ version: 1, name: …, … }`, with a comment on top. */
const flowHall = (config: Record<string, unknown>): string =>
  `# A hall in flow style\n{ ${Object.entries(config)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(', ')} }\n`;

const kamernyConfig = (): Record<string, unknown> => {
  const text = db().versions.get('kamerny-hall@1')?.source;
  if (!text) throw new Error('no sample hall');
  const parsed = parseHallConfig(text, { format: 'yaml', maxBytes: Number.MAX_SAFE_INTEGER });
  if (!parsed.ok) throw new Error('not a valid hall');
  return parsed.config as unknown as Record<string, unknown>;
};

test.describe('hall text edits', () => {
  test('top-level id and name change, nested ids and comments stay', () => {
    const text = `${YAML}layout:\n  bands:\n    - id: main\n`;
    const renamed = setTopLevelField(text, 'name', 'Aurora: Hall 1');
    expect(renamed).toContain('name: "Aurora: Hall 1"');
    const noId = setTopLevelField(renamed, 'id', undefined);
    expect(noId).not.toMatch(/^id:/m);
    expect(noId).toContain('    - id: main');
    expect(noId).toContain('# Units: metres.');
    const added = setTopLevelField(noId, 'id', 'aurora');
    expect(added).toMatch(/^version: 1\nid: aurora$/m);
    expect(parseHallConfig(added, { format: 'yaml' }).ok).toBe(false); // incomplete on purpose
  });

  test('the header comment is replaced up to the generic lines', () => {
    const replaced = replaceHeaderComment(YAML, hallHeader('Aurora'));
    expect(replaced.startsWith('# Cinema Hall Config — Aurora.\n# Units: metres.')).toBe(true);
    expect(replaced).not.toContain('Orbita Hall 2: a sample');
    expect(replaceHeaderComment('version: 1\n', '# New')).toBe('# New\nversion: 1\n');
  });

  test('a copy names itself and claims nothing about the hall it came from', () => {
    const copy = prepareCopy(YAML, { name: copyName('Orbita Hall 2') });
    expect(copy).toContain('name: "Orbita Hall 2 (copy)"');
    expect(copy).not.toMatch(/^id:/m);
    expect(copy.split('\n')[0]).toBe('# Cinema Hall Config — Orbita Hall 2 (copy).');
    expect(copyName('X (copy)')).toBe('X (copy)');
  });

  test('JSON documents are edited as JSON', () => {
    const json = JSON.stringify({ version: 1, id: 'a', name: 'A' });
    const edited = JSON.parse(prepareCopy(json, { name: 'B', id: 'b' })) as Record<string, unknown>;
    expect(edited).toEqual({ version: 1, id: 'b', name: 'B' });
  });
});

test.describe('hall text edits keep block scalars intact', () => {
  const source = (): string => db().versions.get('kamerny-hall@1')?.source ?? '';
  const parse = (text: string) => {
    const parsed = parseHallConfig(text, { format: 'yaml' });
    if (!parsed.ok) throw new Error(parsed.issues.map((issue) => issue.code).join(', '));
    return parsed.config;
  };

  test('an id written as a folded block is replaced whole', () => {
    const folded = source().replace(/^id: .*$/m, 'id: >-\n  kamerny-hall');
    expect(parse(folded).id).toBe('kamerny-hall');
    const renamed = setTopLevelField(folded, 'id', 'aurora');
    expect(parse(renamed).id).toBe('aurora');
    expect(renamed).not.toMatch(/^ {2}kamerny-hall$/m);
    const removed = setTopLevelField(folded, 'id', undefined);
    expect(parse(removed).id).toBeUndefined();
    expect(removed).not.toContain('kamerny-hall\nname');
  });

  test('multi-line names (block, quoted and plain) are replaced whole by a copy', () => {
    for (const name of [
      'name: |-\n  Chamber\n  Hall',
      'name: >\n  Chamber\n\n  Hall',
      'name: "Chamber\n  Hall"',
      'name: Chamber\n  Hall',
    ]) {
      const text = source().replace(/^name: .*$/m, name);
      expect(parse(text).name, name).toContain('Chamber');
      const copy = prepareCopy(text, { name: 'Chamber Hall (copy)' });
      const config = parse(copy);
      expect(config.name, name).toBe('Chamber Hall (copy)');
      expect(config.id, name).toBeUndefined();
      // The rest of the document stays: the comments and the hall type.
      expect(copy).toContain('# Units: metres, degrees.');
      expect(config.meta).toEqual({ hallType: '2D' });
    }
  });

  test('comments around the field stay, the field keeps its place', () => {
    const text = 'version: 1\n# the id\nid: >-\n  a-b\n\n# the name\nname: N\n';
    expect(setTopLevelField(text, 'id', 'c')).toBe(
      'version: 1\n# the id\nid: c\n\n# the name\nname: N\n',
    );
  });

  test('a hall whose folded id is taken is created under another id', () => {
    const folded = source().replace(/^id: .*$/m, 'id: >-\n  kamerny-hall');
    const created = createHall({ yaml: folded, name: `Folded ${Date.now().toString(36)}` });
    if (!created.body.ok) throw new Error(created.body.message);
    const stored = db().versions.get(`${created.body.hall.id}@1`);
    expect(stored && parse(stored.source).id).toBe(created.body.hall.id);
    db().halls.delete(created.body.hall.id);
    if (stored) db().versions.delete(stored.id);
  });
});

test.describe('hall text edits keep valid YAML', () => {
  test('a name or id that YAML would read as a number or a boolean is quoted', () => {
    for (const value of ['123', '1e3', '0x1f', 'true', 'null', 'yes', 'off']) {
      expect(yamlScalar(value)).toBe(JSON.stringify(value));
    }
    expect(yamlScalar('orbita-hall-2')).toBe('orbita-hall-2');
    const renamed = setTopLevelField(setTopLevelField(kamerny(), 'name', '123'), 'id', '2024');
    const parsed = parseHallConfig(renamed, { format: 'yaml' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.config.name).toBe('123');
    expect(parsed.config.id).toBe('2024');
  });

  test('a hall named 123 without an id is created (the derived id is not a number)', () => {
    const yaml = setTopLevelField(kamerny(), 'id', undefined);
    const outcome = createHall({ yaml, name: '123' });
    expect(outcome.status).toBe(201);
    if (!outcome.body.ok) throw new Error(outcome.body.message);
    const stored = db().versions.get(`${outcome.body.hall.id}@1`);
    expect(stored?.config.name).toBe('123');
    expect(typeof stored?.config.id).toBe('string');
  });

  test('a quoted top-level key is replaced, not duplicated', () => {
    const base = setTopLevelField(kamerny(), 'id', undefined);
    for (const key of ['"id"', "'id'", 'id ']) {
      const text = base.replace(/^version: 1$/m, `version: 1\n${key}: old-hall`);
      expect(parseHallConfig(text, { format: 'yaml' }).ok, key).toBe(true);
      const edited = setTopLevelField(text, 'id', 'new-hall');
      expect(edited).not.toContain('old-hall');
      const parsed = parseHallConfig(edited, { format: 'yaml' });
      expect(parsed.ok, key).toBe(true);
      if (parsed.ok) expect(parsed.config.id).toBe('new-hall');
      expect(setTopLevelField(text, 'id', undefined)).not.toContain('old-hall');
    }
  });
});

test.describe('id and name edits keep any valid hall text valid', () => {
  const config = (): Record<string, unknown> =>
    parseHallConfig(kamerny(), { strict: true }).config as unknown as Record<string, unknown>;
  /** The same hall with its top-level mapping indented by two spaces. */
  const indented = (): string =>
    `# An indented hall\n${serializeHallConfig(parseHallConfig(kamerny(), { strict: true }).config)
      .split('\n')
      .map((line) => (line === '' ? line : `  ${line}`))
      .join('\n')}`;
  /** The same hall in YAML flow syntax (plain keys, so it is not JSON). */
  const flow = (): string =>
    `# A flow hall\n${JSON.stringify(config()).replace(/"([a-zA-Z]+)":/g, '$1: ')}\n`;

  for (const [label, make] of [
    ['an indented mapping', indented],
    ['flow syntax', flow],
  ] as const) {
    test(`${label}: id and name can be removed, added and replaced`, () => {
      const text = make();
      expect(parseHallConfig(text).ok).toBe(true);
      const noId = setTopLevelField(text, 'id', undefined);
      const parsedNoId = parseHallConfig(noId, { strict: true }).config;
      expect(parsedNoId.id).toBeUndefined();
      const withId = setTopLevelField(noId, 'id', 'new-hall');
      const named = setTopLevelField(withId, 'name', 'Aurora: Hall 1');
      const parsed = parseHallConfig(named, { strict: true }).config;
      expect(parsed).toEqual({ ...config(), id: 'new-hall', name: 'Aurora: Hall 1' });
      const copy = prepareCopy(text, { name: 'Copy hall' });
      expect(parseHallConfig(copy, { strict: true }).config.name).toBe('Copy hall');
    });

    test(`${label}: a hall without an id is created, not refused`, () => {
      const text = setTopLevelField(make(), 'id', undefined);
      const outcome = createHall({ yaml: text, name: unique('Indented') });
      expect(outcome.status).toBe(201);
      if (!outcome.body.ok) throw new Error(outcome.body.message);
      const stored = getHallResponse(outcome.body.hall.id);
      expect(parseHallConfig(stored?.source ?? '', { strict: true }).config.id).toBe(
        outcome.body.hall.id,
      );
      // And a copy of it is made as well.
      const asNew = createHall({ yaml: stored?.source ?? '', name: unique('Copy'), asNew: true });
      expect(asNew.status).toBe(201);
    });
  }

  test('the usual layout is still edited line by line, comments included', () => {
    const text = kamerny();
    const edited = setTopLevelField(text, 'name', 'Renamed');
    expect(edited.split('\n').filter((line) => line.startsWith('#'))).toEqual(
      text.split('\n').filter((line) => line.startsWith('#')),
    );
    expect(edited.split('\n')).toHaveLength(text.split('\n').length);
  });
});

test.describe('a comment at the end of the id or name line survives a rewrite', () => {
  test('the trailing comment of a line is found outside quotes only', () => {
    expect(trailingComment('id: hall-1 # booked for the festival')).toBe(
      ' # booked for the festival',
    );
    expect(trailingComment('name: "Hall # 2"   # the old name')).toBe('   # the old name');
    expect(trailingComment("name: 'It''s # 3'")).toBeNull();
    expect(trailingComment('name: Hall#2')).toBeNull();
    expect(trailingComment('"id": a # note')).toBe(' # note');
  });

  test('setting and removing a field keeps the note', () => {
    const text = [
      'version: 1',
      'id: orbita # keep this id for the box office',
      'name: Orbita   # renamed in 2024',
      'cinema: Orbita',
    ].join('\n');
    expect(setTopLevelField(text, 'id', 'orbita-2')).toContain(
      'id: orbita-2 # keep this id for the box office',
    );
    expect(setTopLevelField(text, 'name', 'Orbita Two')).toContain(
      'name: "Orbita Two"   # renamed in 2024',
    );
    const removed = setTopLevelField(text, 'id', undefined);
    expect(removed).not.toMatch(/^id:/m);
    expect(removed).toContain('# keep this id for the box office');
  });

  test('a copy of a sample hall keeps the notes on its fields', () => {
    const source = db().versions.get('kamerny-hall@1')?.source ?? '';
    const noted = source
      .replace(/^name: (.*)$/m, 'name: $1 # the hall name on tickets')
      .replace(/^id: (.*)$/m, 'id: $1 # do not change');
    expect(noted).toContain('# the hall name on tickets');
    const copy = prepareCopy(noted, { name: 'Kamerny copy', id: 'kamerny-copy' });
    expect(copy).toContain('name: "Kamerny copy" # the hall name on tickets');
    expect(copy).toContain('id: kamerny-copy # do not change');
    const parsed = parseHallConfig(copy, { format: 'yaml' });
    expect(parsed.ok).toBe(true);
  });
});

test.describe('a field rewrite keeps the comments around it', () => {
  test('an indented comment after the id or the name stays', () => {
    const text = kamerny()
      .replace(/^id: (.*)$/m, 'id: $1\n  # the id is used in links')
      .replace(/^name: (.*)$/m, 'name: $1\n    # shown on tickets');
    const renamed = setTopLevelField(setTopLevelField(text, 'id', 'other'), 'name', 'Other');
    expect(renamed).toContain('id: other\n  # the id is used in links');
    expect(renamed).toContain('name: "Other"\n    # shown on tickets');
    const removed = setTopLevelField(text, 'id', undefined);
    expect(removed).toContain('  # the id is used in links');
    expect(parseConfig(removed).id).toBeUndefined();
  });

  test('a multi-line value is replaced whole; a # line inside a block or quoted value is its text', () => {
    const base = setTopLevelField(kamerny(), 'name', undefined);
    const block = base.replace(/^version: (.*)$/m, 'version: $1\nname: |\n  Grand\n  # Hall');
    expect(parseConfig(block).name).toBe('Grand\n# Hall\n');
    const named = setTopLevelField(block, 'name', 'Grand');
    expect(parseConfig(named).name).toBe('Grand');
    expect(named).not.toContain('# Hall');
    const plain = base.replace(/^version: (.*)$/m, 'version: $1\nname: Grand\n  Hall\n  # note');
    expect(parseConfig(plain).name).toBe('Grand Hall');
    const edited = setTopLevelField(plain, 'name', 'Small');
    expect(edited).toContain('name: "Small"\n  # note');
    expect(parseConfig(edited).name).toBe('Small');
  });
});

test.describe('a compact JSON upload stays compact when its id is set', () => {
  test('setting a field keeps the layout of the JSON text', () => {
    const compact = JSON.stringify({ version: 1, name: 'A', list: [1, 2, 3] });
    const edited = setTopLevelField(compact, 'id', 'a');
    expect(edited).not.toContain('\n');
    expect(edited.length).toBe(compact.length + ',"id":"a"'.length);
    const pretty = `${JSON.stringify({ version: 1, name: 'A' }, null, 4)}\n`;
    expect(setTopLevelField(pretty, 'id', 'a')).toBe(
      `${JSON.stringify({ version: 1, name: 'A', id: 'a' }, null, 4)}\n`,
    );
  });

  test('a compact hall without an id under the upload limit is stored, not refused with 500', () => {
    const config = configOf('kamerny-hall@1');
    delete config.id;
    // A long list in metadata: small when compact, several times larger when pretty-printed.
    config.meta = {
      ...(config.meta as object | undefined),
      samples: Array.from({ length: 60_000 }, () => 1),
    };
    config.name = unique('Compact JSON hall');
    const json = JSON.stringify(config);
    expect(json.length).toBeLessThan(256 * 1024);
    expect(JSON.stringify(config, null, 2).length).toBeGreaterThan(260 * 1024);
    const outcome = createHall({ yaml: json });
    expect(outcome.status).toBeLessThan(300);
    expect(outcome.body.ok).toBe(true);
  });
});

test.describe('a JSON upload keeps its own formatting when a field is set', () => {
  test('a mostly compact file with one indented line is not pretty-printed', () => {
    const config = configOf('kamerny-hall@1');
    delete config.id;
    config.meta = { samples: Array.from({ length: 50_000 }, () => 1) };
    config.name = unique('Mixed JSON hall');
    // Compact, except that the first member is on a line of its own.
    const json = `{\n  "version": ${JSON.stringify(config.version)},${JSON.stringify(config)
      .slice(1)
      .replace(/"version":[^,]*,/, '')}`;
    expect(JSON.parse(json)).toEqual(config);
    expect(json.length).toBeLessThan(256 * 1024);
    const edited = setTopLevelField(json, 'id', 'mixed-json');
    expect(edited.length).toBe(json.length + ',"id": "mixed-json"'.length);
    expect(JSON.parse(edited)).toEqual({ ...config, id: 'mixed-json' });
    const outcome = createHall({ yaml: json });
    expect(outcome.status).toBeLessThan(300);
    expect(outcome.body.ok).toBe(true);
  });

  test('a value is replaced in place and a removed field takes its comma with it', () => {
    const text = '{ "version": 1,\n  "id": "old",  "name": "A",\n  "list": [1, 2] }\n';
    expect(setTopLevelField(text, 'id', 'new')).toBe(
      '{ "version": 1,\n  "id": "new",  "name": "A",\n  "list": [1, 2] }\n',
    );
    expect(setTopLevelField(text, 'id', undefined)).toBe(
      '{ "version": 1,\n  "name": "A",\n  "list": [1, 2] }\n',
    );
    const lastOne = '{"version":1,"id":"old"}';
    expect(setTopLevelField(lastOne, 'id', undefined)).toBe('{"version":1}');
    // A nested "id" is not the hall's.
    const nested = '{"version":1,"meta":{"id":"inner"},"name":"A"}';
    expect(JSON.parse(setTopLevelField(nested, 'id', 'x'))).toEqual({
      version: 1,
      meta: { id: 'inner' },
      name: 'A',
      id: 'x',
    });
  });

  test('a repeated key falls back to compact JSON with the field set', () => {
    const text = '{\n  "id": "a",\n  "id": "b",\n  "name": "A"\n}';
    expect(JSON.parse(setTopLevelField(text, 'id', 'c'))).toEqual({ id: 'c', name: 'A' });
  });
});

test.describe('adding an id to a JSON hall', () => {
  /** A JSON hall without an id, with `gap` blank lines before its last member, at `size` bytes. */
  const jsonHall = (name: string, size: number): string => {
    const parsed = parseHallConfig(kamerny(), { format: 'yaml', strict: true });
    const { id: _id, ...rest } = { ...parsed.config, name };
    const pretty = `${JSON.stringify(rest, null, 2)}\n`;
    const at = pretty.lastIndexOf('\n  "');
    const pad = size - bytes(pretty);
    return pretty.slice(0, at) + '\n'.repeat(pad) + pretty.slice(at);
  };

  test('a 256 KiB file with a long blank run before its last member is created', () => {
    const name = unique('Json gap');
    const yaml = jsonHall(name, MAX_YAML_BYTES);
    expect(bytes(yaml)).toBe(MAX_YAML_BYTES);
    const outcome = createHall({ yaml });
    expect(outcome.status).toBe(201);
    if (!outcome.body.ok) throw new Error(outcome.body.message);
    const source = outcome.body.stored?.source ?? '';
    expect(bytes(source)).toBeLessThanOrEqual(MAX_STORED_YAML_BYTES);
    // The id goes on a line of its own, indented like the member before it.
    expect(source).toMatch(new RegExp(`,\\n  "id": "${outcome.body.hall.id}"\\n}`));
  });

  test('a long run of spaces on one line is not copied either', () => {
    const text = `{"version": 1,${' '.repeat(1000)}"name": "x"}`;
    const edited = setTopLevelField(text, 'id', 'new-hall');
    expect(edited).toBe(`{"version": 1,${' '.repeat(1000)}"name": "x", "id": "new-hall"}`);
  });
});

test.describe('a field edit keeps a compact hall compact', () => {
  const big = (): Record<string, unknown> => {
    const config = parseConfig(kamerny());
    delete config.id;
    // A long list in metadata: about 200 KiB when compact, far over the limit when written in block style.
    config.meta = { samples: Array.from({ length: 100_000 }, () => 1) };
    config.name = unique('Flow hall');
    return config;
  };

  test('setting, replacing and removing a field of a flow mapping is a text edit', () => {
    const text = flowHall(big());
    const added = setTopLevelField(text, 'id', 'flow-hall');
    expect(bytes(added) - bytes(text)).toBe(', id: flow-hall'.length);
    expect(parseConfig(added).id).toBe('flow-hall');
    expect(added.startsWith('# A hall in flow style\n{ ')).toBe(true);
    const renamed = setTopLevelField(added, 'name', 'Flow: Hall 1');
    expect(parseConfig(renamed).name).toBe('Flow: Hall 1');
    expect(bytes(renamed)).toBeLessThan(bytes(added) + 40);
    const removed = setTopLevelField(added, 'id', undefined);
    expect(parseConfig(removed).id).toBeUndefined();
    expect(bytes(removed)).toBe(bytes(text));
    // Without a comment on top, and a field in the middle: the rest stays byte for byte.
    const config = parseConfig(kamerny());
    const plain = flowHall(config).replace(/^# .*\n/, '');
    const name = `name: ${JSON.stringify(config.name)}`;
    expect(setTopLevelField(plain, 'name', 'B 2')).toBe(plain.replace(name, 'name: "B 2"'));
    expect(setTopLevelField(plain, 'id', undefined)).toBe(plain.replace(/id: "[^"]*", /, ''));
  });

  test('a ~200 KiB flow-style hall without an id is stored, and its copy fits too', () => {
    const text = flowHall(big());
    expect(bytes(text)).toBeGreaterThan(195 * 1024);
    expect(bytes(text)).toBeLessThan(MAX_YAML_BYTES);
    const outcome = createHall({ yaml: text });
    expect(outcome.status).toBe(201);
    const hallId = outcome.body.ok ? outcome.body.hall.id : '';
    const stored = db().halls.get(hallId);
    const source = stored ? db().versions.get(stored.currentVersionId)?.source : undefined;
    if (!source) throw new Error('not stored');
    expect(bytes(source) - bytes(text)).toBeLessThan(200);
    const copy = prepareCopy(source, { name: 'Flow copy' });
    expect(bytes(copy)).toBeLessThan(MAX_STORED_YAML_BYTES);
    expect(parseConfig(copy).name).toBe('Flow copy');
    expect(parseConfig(copy).id).toBeUndefined();
  });

  test('a block mapping written with an indent is edited line by line as well', () => {
    const lines = kamerny()
      .split('\n')
      .map((line) => (line === '' || line.startsWith('#') ? line : `  ${line}`));
    const text = lines.join('\n');
    const edited = setTopLevelField(text, 'id', 'indented');
    expect(parseConfig(edited).id).toBe('indented');
    expect(edited.split('\n').length).toBe(lines.length);
    expect(edited).toContain('\n  id: indented');
  });
});

test.describe('hall text: flow mapping with YAML-only escapes in a key', () => {
  test('a key such as "\\x76ersion" does not break adding an id', () => {
    const { id: _id, version: _version, ...rest } = kamernyConfig();
    const text = `{ "\\x76ersion": 1, ${Object.entries(rest)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(', ')} }\n`;
    const before = parseHallConfig(text, { format: 'yaml', maxBytes: Number.MAX_SAFE_INTEGER });
    expect(before.ok).toBe(true);
    let edited = '';
    expect(() => {
      edited = setTopLevelField(text, 'id', 'new-hall');
    }).not.toThrow();
    const after = parseHallConfig(edited, { format: 'yaml', maxBytes: Number.MAX_SAFE_INTEGER });
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.config.id).toBe('new-hall');
      expect(after.config.version).toBe(1);
    }
  });
});

test.describe('hall size limit with the generated id', () => {
  /** A valid hall without an id and without the given name, padded to exactly `bytes`. */
  const padded = (name: string, bytes: number): string => {
    const base = setTopLevelField(setTopLevelField(kamerny(), 'id', undefined), 'name', name);
    return base + '\n'.repeat(bytes - Buffer.byteLength(base));
  };

  test('a file at 256 KiB without an id is created, not refused as an internal error', () => {
    const name = unique('Limit hall');
    const yaml = padded(name, MAX_YAML_BYTES);
    expect(Buffer.byteLength(yaml)).toBe(MAX_YAML_BYTES);
    const outcome = createHall({ yaml });
    expect(outcome.status).toBe(201);
    if (!outcome.body.ok) throw new Error(outcome.body.message);
    const id = outcome.body.hall.id;
    const stored = db().versions.get(`${id}@1`);
    expect(stored?.source).toMatch(new RegExp(`^id: ${id}$`, 'm'));
    expect(Buffer.byteLength(stored?.source ?? '')).toBeGreaterThan(MAX_YAML_BYTES);
    expect(Buffer.byteLength(stored?.source ?? '')).toBeLessThanOrEqual(MAX_STORED_YAML_BYTES);

    // The stored text can be saved back as it is, copied and saved as a new hall.
    const saved = saveHall(id, 1, stored?.source ?? '');
    expect(saved).toMatchObject({ ok: true, revision: 2 });
    const copy = prepareCopy(stored?.source ?? '', { name: copyName(name) });
    expect(parseHallConfig(copy, { format: 'yaml', maxBytes: MAX_STORED_YAML_BYTES }).ok).toBe(
      true,
    );
    expect(createHall({ yaml: copy, asNew: true }).status).toBe(201);
  });

  test('an upload over 256 KiB is still refused as too large', () => {
    const outcome = createHall({ yaml: padded(unique('Over'), MAX_YAML_BYTES + 1) });
    expect(outcome.status).toBe(400);
    if (outcome.body.ok) throw new Error('accepted');
    expect(outcome.body.error).toBe('invalid_hall');
  });
});

test.describe('copy names fit the name limit', () => {
  test('a 120-character name gets a copy name of at most 120 characters', () => {
    const long = 'A'.repeat(120);
    const name = copyName(long);
    expect(name.length).toBeLessThanOrEqual(120);
    expect(name).toMatch(/ \(copy\)$/);
    const parsed = parseHallConfig(prepareCopy(kamerny(), { name }), {
      format: 'yaml',
      strict: true,
    });
    expect(parsed.config.name).toBe(name);
    // A character made of two code units is not cut in half.
    const emoji = `${'B'.repeat(112)}🎬🎬`;
    expect(copyName(emoji)).toBe(`${'B'.repeat(112)} (copy)`);
    expect(copyName('Grand Hall')).toBe('Grand Hall (copy)');
  });
});

test.describe('copying a hall stored at the size limit', () => {
  test('a copy that would be too large is reported, not thrown', () => {
    // An upload without a header comment and with a short id of its own: its copy gets a header
    // and `(copy)` in its name, and loses only the short id line.
    const name = unique('Full hall');
    const upload = setTopLevelField(
      kamerny().replace(/^(?:#.*\n)+/, ''),
      'id',
      `z${Math.random().toString(36).slice(2, 7)}`,
    );
    expect(upload.startsWith('#')).toBe(false);
    const created = createHall({ yaml: upload, name });
    if (!created.body.ok) throw new Error(created.body.message);
    const id = created.body.hall.id;
    const base = db().versions.get(`${id}@1`)?.source ?? '';
    const full = base + '\n'.repeat(MAX_STORED_YAML_BYTES - bytes(base));
    expect(bytes(full)).toBe(MAX_STORED_YAML_BYTES);
    expect(saveHall(id, 1, full)).toMatchObject({ ok: true, revision: 2 });
    const stored = db().versions.get(`${id}@2`)?.source ?? '';
    const options = { name: copyName(name) };
    // The copy outgrows the limit by its new name: the strict parse used to throw here.
    expect(bytes(prepareCopy(stored, options))).toBeGreaterThan(MAX_STORED_YAML_BYTES);
    expect(() =>
      parseHallConfig(prepareCopy(stored, options), {
        format: 'yaml',
        strict: true,
        maxBytes: MAX_STORED_YAML_BYTES,
      }),
    ).toThrow();
    expect(prepareCopyWithin(stored, options, MAX_STORED_YAML_BYTES)).toBeNull();
    // A hall of the usual size is copied as before.
    expect(prepareCopyWithin(kamerny(), options, MAX_STORED_YAML_BYTES)).toBe(
      prepareCopy(kamerny(), options),
    );
  });
});

test.describe('a name given with a new hall', () => {
  /** The sample hall as JSON with a second `name` key: a duplicate key the parser refuses. */
  const duplicateName = (): string => {
    const parsed = parseHallConfig(kamerny());
    if (!parsed.ok) throw new Error('sample hall does not parse');
    return `{"name": "First", ${JSON.stringify(parsed.config).slice(1)}`;
  };

  test('does not hide a fault in the text it replaces: a duplicate key is refused either way', () => {
    const json = duplicateName();
    const without = createHall({ yaml: json });
    expect(without.status).toBe(400);
    const named = createHall({ yaml: json, name: unique('Override') });
    expect(named.status).toBe(400);
    expect(named.body).toMatchObject({ ok: false, error: 'invalid_hall' });
    if (named.body.ok) throw new Error('accepted');
    expect(named.body.issues?.map((issue) => issue.code)).toContain('schema.syntax');
  });

  test('a text over the size limit is refused before its name is replaced', () => {
    const big = `${kamerny()}\n# ${'x'.repeat(300 * 1024)}\n`;
    const outcome = createHall({ yaml: big, name: unique('Big') });
    expect(outcome.status).toBe(400);
    if (outcome.body.ok) throw new Error('accepted');
    expect(outcome.body.issues?.map((issue) => issue.code)).toContain('schema.tooLarge');
  });

  test('still replaces the name of a readable text, and of one whose own name is invalid', () => {
    const name = unique('Renamed');
    const ok = createHall({ yaml: kamerny(), name });
    expect(ok.status).toBe(201);
    if (!ok.body.ok) throw new Error(ok.body.message);
    expect(ok.body.hall.name).toBe(name);
    // An empty name in the text is a schema error, not a syntax one: the override fixes it.
    const blank = kamerny().replace(/^name:.*$/m, "name: ''");
    expect(createHall({ yaml: blank }).status).toBe(400);
    expect(createHall({ yaml: blank, name: unique('Fixed') }).status).toBe(201);
  });
});
