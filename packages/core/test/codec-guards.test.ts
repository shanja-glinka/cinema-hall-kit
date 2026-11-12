import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { parseHallConfig, serializeHallConfig } from '../src/codec.js';
import { fixtureConfig, fixtureRaw, fixtureText } from './support.js';

const reasonOf = (text: string) => {
  const result = parseHallConfig(text);
  return result.ok ? undefined : result.issues[0]?.params?.reason;
};

describe('one parser and one set of guards for JSON and YAML', () => {
  it('rejects a duplicate key in JSON, which JSON.parse used to accept silently', () => {
    const text = JSON.stringify(fixtureRaw()).replace(
      '"name":"Meridian Hall 3"',
      '"name":"Meridian Hall 3","name":"X"',
    );
    expect(parseHallConfig(text).issues[0]).toMatchObject({
      code: 'schema.syntax',
      params: { reason: 'duplicate key' },
    });
  });

  it('reads flow-style YAML in auto mode, where a leading brace used to mean JSON', () => {
    const flow = stringify(fixtureRaw(), { collectionStyle: 'flow', lineWidth: 0 });
    expect(flow.trimStart().startsWith('{')).toBe(true);
    const result = parseHallConfig(flow);
    expect(result.ok && result.config.name).toBe('Meridian Hall 3');
  });

  it('refuses an explicit tag in the core namespace', () => {
    const text = fixtureText.replace(
      'name: Meridian Hall 3',
      'name: !<tag:yaml.org,2002:str> Meridian Hall 3',
    );
    expect(text).not.toBe(fixtureText);
    expect(reasonOf(text)).toBe('custom tags are not allowed');
  });

  it('refuses a standard YAML tag too, since hall configs need no tags', () => {
    expect(reasonOf('name: !!str Hall\n')).toBe('custom tags are not allowed');
  });
});

describe('serialization writes no anchors or aliases', () => {
  it('writes an object that appears under two keys in full, and parses it back', () => {
    const config = fixtureConfig();
    config.seatTypes.vip = config.seatTypes.standard!;
    const result = parseHallConfig(serializeHallConfig(config));
    expect(result.ok && result.config).toEqual(config);
  });

  it('does the same when a YAML source is kept', () => {
    const config = fixtureConfig();
    config.seatTypes.vip = config.seatTypes.standard!;
    const result = parseHallConfig(serializeHallConfig(config, { source: fixtureText }));
    expect(result.ok && result.config).toEqual(config);
  });
});

describe('serialization keeps comments on list items that did not change', () => {
  it('rewrites only the changed item of a plain list and keeps the other comments', () => {
    const list = [
      '  rowLabels:',
      '    - A # first row',
      '    - B',
      '    - C',
      '    - D',
      '    - E # fifth row',
      '    - F',
      '    - G',
      '    - H',
      '    - I',
      '',
    ].join('\n');
    const source = fixtureText.replace(/ {2}rowLabels: alphabetic.*\n/, list);
    expect(parseHallConfig(source).ok).toBe(true);

    const config = fixtureConfig();
    config.layout.rowLabels = ['A', 'B', 'C', 'D', 'E2', 'F', 'G', 'H', 'I'];
    const text = serializeHallConfig(config, { source });
    expect(text).toContain('# first row');
    expect(text).toContain('- E2 # fifth row');
    const back = parseHallConfig(text);
    expect(back.ok && back.config.layout.rowLabels).toEqual(config.layout.rowLabels);
  });
});
