import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSeatManifest, diffSeatManifests } from '../src/manifest.js';
import { fixtureConfig } from './support.js';

const golden: unknown = JSON.parse(
  readFileSync(new URL('./__golden__/meridian-hall-3.manifest.json', import.meta.url), 'utf8'),
);

describe('buildSeatManifest', () => {
  it('matches the golden manifest of the fixture (hashes cannot drift silently)', () => {
    expect(buildSeatManifest(fixtureConfig())).toEqual(golden);
  });

  it('lists every seat with a sha256 hash per set', () => {
    const manifest = buildSeatManifest(fixtureConfig());
    expect(manifest.seats).toHaveLength(126);
    expect(manifest.hallId).toBe('meridian-hall-3');
    expect(manifest.seatSetHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(manifest.geometryHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(manifest.seats[0]).toMatchObject({
      key: 'left.r1.s1',
      label: 'A1',
      row: 'A',
      sectionId: 'left',
    });
  });

  it('omits hallId for a config without an id', () => {
    const config = fixtureConfig();
    delete config.id;
    expect(buildSeatManifest(config)).not.toHaveProperty('hallId');
  });

  it('changes geometryHash on a move but not seatSetHash', () => {
    const moved = fixtureConfig();
    moved.layout.firstRowDistance = 5;
    const base = buildSeatManifest(fixtureConfig());
    const next = buildSeatManifest(moved);
    expect(next.seatSetHash).toBe(base.seatSetHash);
    expect(next.geometryHash).not.toBe(base.geometryHash);
  });

  it('changes seatSetHash on a relabel but not geometryHash', () => {
    const relabelled = fixtureConfig();
    relabelled.layout.seatNumbering = 'perSection';
    const base = buildSeatManifest(fixtureConfig());
    const next = buildSeatManifest(relabelled);
    expect(next.geometryHash).toBe(base.geometryHash);
    expect(next.seatSetHash).not.toBe(base.seatSetHash);
  });
});

describe('diffSeatManifests', () => {
  const base = buildSeatManifest(fixtureConfig());

  it('is empty for identical manifests', () => {
    expect(diffSeatManifests(base, base)).toEqual({
      added: [],
      removed: [],
      moved: [],
      relabelled: [],
      retyped: [],
    });
  });

  it('reports added seats when a section grows', () => {
    const config = fixtureConfig();
    config.layout.bands[0]!.sections[1]!.seatsPerRow = 9;
    const diff = diffSeatManifests(base, buildSeatManifest(config));
    expect(diff.added).toHaveLength(7);
    expect(diff.added).toContain('centre.r1.s9');
    expect(diff.removed).toEqual([]);
  });

  it('reports removed seats and the seats renumbered after them', () => {
    const config = fixtureConfig();
    config.layout.bands[0]!.sections[1]!.exclude = ['r1.s1'];
    const diff = diffSeatManifests(base, buildSeatManifest(config));
    expect(diff.removed).toEqual(['centre.r1.s1']);
    expect(diff.relabelled).toContainEqual({ key: 'centre.r1.s2', from: 'A5', to: 'A4' });
  });

  it('reports moved seats with their offsets', () => {
    const config = fixtureConfig();
    config.layout.firstRowDistance = 5.45;
    const diff = diffSeatManifests(base, buildSeatManifest(config));
    expect(diff.moved).toHaveLength(126);
    expect(diff.moved[0]).toEqual({ key: 'left.r1.s1', dx: 0, dy: 0, dz: 0.5 });
  });

  it('reports seats whose price tier changes as retyped', () => {
    const config = fixtureConfig();
    config.layout.bands[0]!.sections[0]!.priceTier = 'premium';
    const diff = diffSeatManifests(base, buildSeatManifest(config));
    expect(diff.retyped).toHaveLength(21);
    expect(diff.moved).toEqual([]);
  });

  it('reports the change of a seat type as retyped', () => {
    const config = fixtureConfig();
    config.layout.bands[0]!.sections[0]!.seatType = 'recliner';
    const diff = diffSeatManifests(base, buildSeatManifest(config));
    expect(diff.retyped).toContain('left.r1.s1');
  });
});
