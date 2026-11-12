import { describe, expect, it } from 'vitest';
import { buildSeatManifest, diffSeatManifests, type SeatManifest } from '../src/manifest.js';
import { fixtureConfig } from './support.js';

const withFirstRow = (distance: number) => {
  const config = fixtureConfig();
  config.layout.firstRowDistance = distance;
  return buildSeatManifest(config);
};

describe('diffSeatManifests compares the millimetres that geometryHash uses', () => {
  it('reports a move that changes a rounded millimetre, however small', () => {
    const base = withFirstRow(5.0004);
    const next = withFirstRow(5.0006);
    expect(next.geometryHash).not.toBe(base.geometryHash);
    const diff = diffSeatManifests(base, next);
    expect(diff.moved).toHaveLength(126);
    expect(diff.moved[0]).toEqual({ key: 'left.r1.s1', dx: 0, dy: 0, dz: 0.0002 });
  });

  it('reports nothing for a shift that keeps every rounded millimetre', () => {
    const base = withFirstRow(4.9996);
    const next = withFirstRow(5.0004);
    expect(next.geometryHash).toBe(base.geometryHash);
    expect(diffSeatManifests(base, next).moved).toEqual([]);
  });

  it('reports a seat whose floor height changes (riser), with its dy', () => {
    const config = fixtureConfig();
    config.layout.bands[0]!.riserHeight = 0.16;
    const base = buildSeatManifest(fixtureConfig());
    const next = buildSeatManifest(config);
    expect(next.geometryHash).not.toBe(base.geometryHash);
    const diff = diffSeatManifests(base, next);
    expect(diff.moved).toContainEqual({ key: 'left.r2.s1', dx: 0, dy: 0.01, dz: 0 });
    expect(diff.moved.some((moved) => moved.key === 'left.r1.s1')).toBe(false);
  });

  it('tolerates a manifest stored before the y field existed', () => {
    const base = buildSeatManifest(fixtureConfig());
    const stored: SeatManifest = {
      ...base,
      seats: base.seats.map(({ y: _y, ...seat }) => seat),
    };
    expect(diffSeatManifests(stored, base).moved).toEqual([]);
  });

  it('compares manifests that carry only the required fields', () => {
    const minimal: SeatManifest = {
      manifestVersion: 1,
      schemaVersion: 1,
      seatSetHash: 'sha256:0',
      geometryHash: 'sha256:0',
      seats: [],
    };
    expect(diffSeatManifests(minimal, minimal)).toEqual({
      added: [],
      removed: [],
      moved: [],
      relabelled: [],
      retyped: [],
    });
  });
});

describe('buildSeatManifest exposes meta outside both hashes', () => {
  it('carries root, seat type and section meta and leaves the hashes unchanged', () => {
    const plain = buildSeatManifest(fixtureConfig());
    const config = fixtureConfig();
    config.seatTypes.standard!.meta = { code: 'STD' };
    config.layout.bands[0]!.sections[0]!.meta = { zone: 'front' };
    const manifest = buildSeatManifest(config);
    expect(manifest.meta).toEqual({ hallType: 'LUX' });
    expect(manifest.seatTypes).toEqual({
      standard: { label: 'Classic', meta: { code: 'STD' } },
      recliner: { label: 'Lounge' },
    });
    expect(manifest.sections?.left).toEqual({ bandId: 'main', meta: { zone: 'front' } });
    expect(manifest.sections?.['rec-left']).toEqual({ bandId: 'recliners' });
    expect(manifest.seatSetHash).toBe(plain.seatSetHash);
    expect(manifest.geometryHash).toBe(plain.geometryHash);
  });

  it('carries hall and band meta and leaves the hashes unchanged', () => {
    const plain = buildSeatManifest(fixtureConfig());
    const config = fixtureConfig();
    config.hall.meta = { screen: 'laser' };
    config.layout.bands[1]!.meta = { tier: 'premium' };
    const manifest = buildSeatManifest(config);
    expect(manifest.hall).toEqual({ meta: { screen: 'laser' } });
    expect(manifest.bands).toEqual({ main: {}, recliners: { meta: { tier: 'premium' } } });
    expect(manifest.seatSetHash).toBe(plain.seatSetHash);
    expect(manifest.geometryHash).toBe(plain.geometryHash);
  });

  it('omits hall meta when the hall has none', () => {
    expect(buildSeatManifest(fixtureConfig())).not.toHaveProperty('hall');
  });
});
