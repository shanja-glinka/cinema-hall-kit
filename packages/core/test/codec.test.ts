import { describe, expect, it } from 'vitest';
import {
  HallConfigError,
  checkStructure,
  parseHallConfig,
  serializeHallConfig,
} from '../src/codec.js';
import type { HallConfig } from '../src/schema.js';
import type { Issue } from '../src/issues.js';
import { fixtureConfig, fixtureRaw, fixtureText } from './support.js';

const codes = (issues: Issue[]) => issues.map((issue) => issue.code);
const structuralOnly = (raw: unknown) => {
  const result = parseHallConfig(raw);
  if (result.ok) throw new Error('expected a structural failure');
  return result;
};

describe('parseHallConfig — input formats', () => {
  it('parses the YAML fixture; the only warnings are semantic', () => {
    const result = parseHallConfig(fixtureText);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.name).toBe('Meridian Hall 3');
    expect(codes(result.issues)).toContain('view.frontRowVertical');
  });

  it('parses JSON text that starts with a brace in auto mode', () => {
    const result = parseHallConfig(JSON.stringify(fixtureConfig()));
    expect(result.ok).toBe(true);
  });

  it('reads YAML text under format json too: the format only changes error wording', () => {
    expect(parseHallConfig(fixtureText, { format: 'json' }).ok).toBe(true);
  });

  it('reports a JSON syntax error with a 1-based position and JSON wording', () => {
    const result = parseHallConfig('{"version": 1,\n  "name" "x"}', { format: 'json' });
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({
      code: 'schema.syntax',
      position: { line: 2, col: 10 },
      params: { reason: expect.stringMatching(/^JSON: /) },
    });
  });

  it('accepts an already parsed object', () => {
    expect(parseHallConfig(fixtureRaw()).ok).toBe(true);
  });

  it('rejects a non-object root with a type error at the root', () => {
    const result = structuralOnly(null);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'schema.invalidType', path: [] }),
    ]);
  });

  it('rejects input larger than maxBytes', () => {
    const result = parseHallConfig(fixtureText, { maxBytes: 100 });
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({ code: 'schema.tooLarge', params: { maxBytes: 100 } });
  });

  it('reports a YAML syntax error with a position', () => {
    const result = parseHallConfig('name: [unclosed\nversion: 1\n');
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe('schema.syntax');
    expect(result.issues[0]?.position).toEqual({
      line: expect.any(Number),
      col: expect.any(Number),
    });
  });

  it('rejects duplicate YAML keys', () => {
    const result = parseHallConfig('version: 1\nversion: 1\n');
    expect(result.issues[0]).toMatchObject({
      code: 'schema.syntax',
      params: { reason: 'duplicate key' },
    });
  });

  it('rejects YAML aliases', () => {
    const result = parseHallConfig('name: &n Hall\nversion: 1\nmeta: *n\n');
    expect(result.issues[0]).toMatchObject({ params: { reason: 'aliases are not allowed' } });
  });

  it('rejects YAML anchors even without an alias', () => {
    const result = parseHallConfig('name: &n Hall\n');
    expect(result.issues[0]).toMatchObject({ params: { reason: 'anchors are not allowed' } });
  });

  it('rejects custom tags', () => {
    const result = parseHallConfig('name: !custom Hall\n');
    expect(result.issues[0]).toMatchObject({ params: { reason: 'custom tags are not allowed' } });
  });

  it('refuses a newer config version with only that issue', () => {
    const raw = { ...fixtureRaw(), version: 2 };
    const result = structuralOnly(raw);
    expect(result.issues).toEqual([
      {
        severity: 'error',
        code: 'schema.unsupportedVersion',
        path: ['version'],
        params: { version: 2, supported: 1 },
      },
    ]);
  });

  it('throws HallConfigError in strict mode and returns the result otherwise', () => {
    expect(parseHallConfig(fixtureText, { strict: true }).ok).toBe(true);
    const raw = { ...fixtureRaw(), bogus: 1 };
    expect(() => parseHallConfig(raw, { strict: true })).toThrow(HallConfigError);
    try {
      parseHallConfig(raw, { strict: true });
    } catch (error) {
      expect(error).toBeInstanceOf(HallConfigError);
      expect((error as HallConfigError).issues[0]?.code).toBe('schema.unknownKey');
    }
  });
});

describe('zod issues are mapped to schema.* codes', () => {
  it('schema.required for a missing value', () => {
    const raw = fixtureRaw();
    delete raw.name;
    expect(structuralOnly(raw).issues).toContainEqual(
      expect.objectContaining({ code: 'schema.required', path: ['name'] }),
    );
  });

  it('schema.required for a missing version', () => {
    const raw = fixtureRaw();
    delete raw.version;
    expect(structuralOnly(raw).issues[0]).toMatchObject({
      code: 'schema.required',
      path: ['version'],
    });
  });

  it('schema.invalidType for a wrong type', () => {
    const raw = fixtureRaw();
    raw.name = 5;
    expect(structuralOnly(raw).issues[0]).toMatchObject({
      code: 'schema.invalidType',
      path: ['name'],
    });
  });

  it('schema.unknownKey once per unknown key', () => {
    const raw = fixtureRaw();
    raw.bogus = 1;
    raw.hall.extra = 2;
    const issues = structuralOnly(raw).issues;
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'schema.unknownKey',
        path: ['bogus'],
        params: { key: 'bogus' },
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'schema.unknownKey', path: ['hall', 'extra'] }),
    );
  });

  it('schema.tooSmall with the minimum', () => {
    const raw = fixtureRaw();
    raw.hall.width = 0;
    expect(structuralOnly(raw).issues[0]).toMatchObject({
      code: 'schema.tooSmall',
      path: ['hall', 'width'],
      params: { minimum: 0 },
    });
  });

  it('schema.tooBig with the maximum', () => {
    const raw = fixtureRaw();
    raw.hall.width = 1000;
    expect(structuralOnly(raw).issues[0]).toMatchObject({
      code: 'schema.tooBig',
      path: ['hall', 'width'],
      params: { maximum: 500 },
    });
  });

  it('schema.invalidFormat for a bad colour, with the seat type as ref', () => {
    const raw = fixtureRaw();
    raw.seatTypes.standard.color = 'red';
    expect(structuralOnly(raw).issues[0]).toMatchObject({
      code: 'schema.invalidFormat',
      path: ['seatTypes', 'standard', 'color'],
      ref: { seatTypeId: 'standard' },
    });
  });

  it('schema.invalidValue for a literal mismatch', () => {
    const raw = fixtureRaw();
    raw.version = 0;
    expect(structuralOnly(raw).issues[0]).toMatchObject({
      code: 'schema.invalidValue',
      path: ['version'],
    });
  });

  it('adds band and section refs to a section error', () => {
    const raw = fixtureRaw();
    raw.layout.bands[0].sections[0].seatsPerRow = 0;
    expect(structuralOnly(raw).issues[0]).toMatchObject({
      code: 'schema.tooSmall',
      path: ['layout', 'bands', 0, 'sections', 0, 'seatsPerRow'],
      ref: { bandId: 'main', sectionId: 'left' },
    });
  });

  it('maps an unexpected zod issue to schema.invalidValue', () => {
    const raw = fixtureRaw();
    raw.layout.bands = [];
    expect(structuralOnly(raw).issues[0]).toMatchObject({
      code: 'schema.tooSmall',
      path: ['layout', 'bands'],
    });
  });
});

describe('checkStructure', () => {
  const base = (): HallConfig => fixtureConfig();

  it('finds nothing in the fixture', () => {
    expect(checkStructure(base())).toEqual([]);
  });

  it('schema.duplicateId for band and section ids across the hall', () => {
    const band = base();
    band.layout.bands[1]!.id = 'main';
    expect(checkStructure(band)).toContainEqual(
      expect.objectContaining({ code: 'schema.duplicateId', path: ['layout', 'bands', 1, 'id'] }),
    );
    const section = base();
    section.layout.bands[1]!.sections[0]!.id = 'left';
    expect(checkStructure(section)).toContainEqual(
      expect.objectContaining({
        code: 'schema.duplicateId',
        path: ['layout', 'bands', 1, 'sections', 0, 'id'],
        ref: { bandId: 'recliners', sectionId: 'left' },
      }),
    );
  });

  it('schema.duplicateId for viewing zones', () => {
    const config = base();
    config.viewingZones![1]!.id = 'up-close';
    expect(checkStructure(config)).toContainEqual(
      expect.objectContaining({ code: 'schema.duplicateId', path: ['viewingZones', 1, 'id'] }),
    );
  });

  it('schema.unknownSeatType on a section and on band defaults', () => {
    const section = base();
    section.layout.bands[0]!.sections[0]!.seatType = 'nope';
    expect(checkStructure(section)).toContainEqual(
      expect.objectContaining({
        code: 'schema.unknownSeatType',
        path: ['layout', 'bands', 0, 'sections', 0, 'seatType'],
        params: { seatType: 'nope' },
      }),
    );
    const defaults = base();
    defaults.layout.bands[0]!.defaults!.seatType = 'nope';
    expect(checkStructure(defaults)).toContainEqual(
      expect.objectContaining({
        code: 'schema.unknownSeatType',
        path: ['layout', 'bands', 0, 'defaults', 'seatType'],
      }),
    );
  });

  it('schema.unresolved when neither the section nor the band defaults give a value', () => {
    const config = base();
    delete config.layout.bands[0]!.defaults!.rows;
    const issues = checkStructure(config).filter((issue) => issue.code === 'schema.unresolved');
    expect(issues).toHaveLength(3);
    expect(issues[0]).toMatchObject({
      path: ['layout', 'bands', 0, 'sections', 0],
      params: { field: 'rows' },
    });
  });

  it('schema.unresolved for a missing seat type', () => {
    const config = base();
    delete config.layout.bands[1]!.defaults!.seatType;
    expect(
      checkStructure(config).some(
        (i) => i.code === 'schema.unresolved' && i.params?.field === 'seatType',
      ),
    ).toBe(true);
  });

  it('schema.excludeOutOfRange for keys outside rows x seats', () => {
    const config = base();
    config.layout.bands[0]!.sections[1]!.exclude = ['r9.s1', 'r1.s99', 'r1.s2'];
    const issues = checkStructure(config).filter(
      (issue) => issue.code === 'schema.excludeOutOfRange',
    );
    expect(issues.map((issue) => issue.params?.key)).toEqual(['r9.s1', 'r1.s99']);
    expect(issues[0]?.path).toEqual(['layout', 'bands', 0, 'sections', 1, 'exclude', 0]);
  });

  it('schema.excludeOutOfRange for a key that does not match the pattern', () => {
    const config = base();
    config.layout.bands[0]!.sections[1]!.exclude = ['xyz'];
    expect(checkStructure(config)).toContainEqual(
      expect.objectContaining({ code: 'schema.excludeOutOfRange' }),
    );
  });

  it('schema.tooManySeats beyond the hall limit', () => {
    const config = base();
    for (const section of config.layout.bands[0]!.sections) {
      section.seatsPerRow = 200;
      section.rows = 100;
    }
    expect(checkStructure(config)).toContainEqual(
      expect.objectContaining({ code: 'schema.tooManySeats', path: ['layout'] }),
    );
  });

  it('schema.tooManySections beyond the hall limit', () => {
    const config = base();
    const section = (id: string) => ({
      id,
      seatsPerRow: 1,
      rows: 1,
      rowSpacing: 1,
      seatPitch: 1,
      seatType: 'standard',
    });
    config.layout.bands[0]!.sections = Array.from({ length: 33 }, (_, i) => section(`a${i}`));
    config.layout.bands[1]!.sections = Array.from({ length: 33 }, (_, i) => section(`b${i}`));
    expect(checkStructure(config)).toContainEqual(
      expect.objectContaining({ code: 'schema.tooManySections', params: { count: 66, max: 64 } }),
    );
  });

  it('schema.rowLabelsTooShort when the labels do not cover every row', () => {
    const config = base();
    config.layout.rowLabels = ['A', 'B'];
    expect(checkStructure(config)).toContainEqual(
      expect.objectContaining({ code: 'schema.rowLabelsTooShort', params: { rows: 9, labels: 2 } }),
    );
  });

  it('schema.tooSmall for empty seatTypes', () => {
    const config = base();
    config.seatTypes = {};
    expect(checkStructure(config)).toContainEqual(
      expect.objectContaining({ code: 'schema.tooSmall', path: ['seatTypes'] }),
    );
  });

  it('schema.tooBig for more seat types than the limit', () => {
    const config = base();
    for (let i = 0; i < 33; i++) {
      config.seatTypes[`t${i}`] = { label: `T${i}`, width: 0.5, depth: 0.5, color: '#000000' };
    }
    expect(checkStructure(config)).toContainEqual(
      expect.objectContaining({ code: 'schema.tooBig', path: ['seatTypes'] }),
    );
  });
});

describe('serializeHallConfig', () => {
  const roundTrip = (text: string) => parseHallConfig(text);

  it('writes JSON with a trailing newline that parses back', () => {
    const config = fixtureConfig();
    const text = serializeHallConfig(config, { format: 'json' });
    expect(text.endsWith('\n')).toBe(true);
    expect(
      parseHallConfig(text).ok && (parseHallConfig(text) as { config: HallConfig }).config,
    ).toEqual(config);
  });

  it('round-trips YAML without a source', () => {
    const config = fixtureConfig();
    const result = roundTrip(serializeHallConfig(config));
    expect(result.ok && result.config).toEqual(config);
  });

  it('round-trips with the fixture as source and keeps its comments', () => {
    const config = fixtureConfig();
    const text = serializeHallConfig(config, { source: fixtureText });
    const result = roundTrip(text);
    expect(result.ok && result.config).toEqual(config);
    expect(text).toContain('# Units: metres, degrees.');
    expect(text).toContain('# Optional validation thresholds.');
    expect(text).toContain('# Bands are rows of sections');
  });

  it('keeps comments when one value changes', () => {
    const config = fixtureConfig();
    config.hall.width = 15;
    const text = serializeHallConfig(config, { source: fixtureText });
    expect(text).toMatch(/width: 15/);
    expect(text).toContain('# Interior hall dimensions.');
    const result = roundTrip(text);
    expect(result.ok && result.config.hall.width).toBe(15);
  });

  it('deletes keys that are gone from the config', () => {
    const config = fixtureConfig();
    delete config.constraints;
    const text = serializeHallConfig(config, { source: fixtureText });
    expect(text).not.toMatch(/^constraints:/m);
    const result = roundTrip(text);
    expect(result.ok && result.config.constraints).toBeUndefined();
    expect(result.ok && result.config).toEqual(config);
  });

  it('adds keys that are new in the config', () => {
    const config = fixtureConfig();
    config.seatTypes.vip = { label: 'VIP', width: 0.6, depth: 0.95, color: '#D4AF37' };
    const result = roundTrip(serializeHallConfig(config, { source: fixtureText }));
    expect(result.ok && result.config).toEqual(config);
  });

  it('round-trips when bands are reordered (id lists are matched by id)', () => {
    const config = fixtureConfig();
    config.layout.bands.reverse();
    const result = roundTrip(serializeHallConfig(config, { source: fixtureText }));
    expect(result.ok && result.config).toEqual(config);
  });

  it('replaces a plain array such as exclude', () => {
    const config = fixtureConfig();
    config.layout.bands[0]!.sections[1]!.exclude = ['r1.s1'];
    const text = serializeHallConfig(config, { source: fixtureText });
    expect(text).toContain('exclude');
    expect(roundTrip(text)).toMatchObject({ ok: true, config: { layout: expect.anything() } });
    const result = roundTrip(text);
    expect(result.ok && result.config).toEqual(config);
  });

  it('replaces a scalar in the source by a map when the config needs one', () => {
    const config = fixtureConfig();
    const result = roundTrip(serializeHallConfig(config, { source: 'version: 1\nmeta: scalar\n' }));
    expect(result.ok && result.config.meta).toEqual(config.meta);
  });

  it('ignores a source that is not valid YAML', () => {
    const config = fixtureConfig();
    const result = roundTrip(serializeHallConfig(config, { source: 'name: [' }));
    expect(result.ok && result.config).toEqual(config);
  });
});
