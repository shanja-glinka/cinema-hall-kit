import { describe, expect, it } from 'vitest';
import { Box3, type BufferGeometry } from 'three';
import {
  buildCurtains,
  buildPlatforms,
  buildProceduralSeat,
  buildScreenGeometry,
} from '../../src/scene/geometry.js';
import { fixtureLayout } from './fixtures.js';

function boundsOf(geometry: BufferGeometry): Box3 {
  geometry.computeBoundingBox();
  return geometry.boundingBox ?? new Box3();
}

describe('procedural seat', () => {
  it('matches the width and depth of the seat type', () => {
    const box = boundsOf(buildProceduralSeat(0.55, 0.6));
    expect(box.max.x - box.min.x).toBeCloseTo(0.55, 2);
    expect(box.max.z - box.min.z).toBeCloseTo(0.6, 2);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 3);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(0, 3);
  });

  it('stands on the floor with a 0.98 m backrest', () => {
    const box = boundsOf(buildProceduralSeat(0.55, 0.6));
    expect(box.min.y).toBeCloseTo(0, 3);
    expect(box.max.y).toBeCloseTo(0.98, 3);
  });

  it('makes a deeper recliner', () => {
    const box = boundsOf(buildProceduralSeat(0.58, 0.9));
    expect(box.max.z - box.min.z).toBeCloseTo(0.9, 2);
    expect(box.max.x - box.min.x).toBeCloseTo(0.58, 2);
  });
});

describe('screen geometry', () => {
  it('is flat when the sagitta is zero', () => {
    const geometry = buildScreenGeometry(11.5, 4.8, 0, 3.6);
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) expect(position.getZ(i)).toBe(0);
  });

  it('puts the edges at the sagitta and the centre at zero', () => {
    const width = 11.5;
    const sagitta = 0.4;
    const geometry = buildScreenGeometry(width, 4.8, sagitta, 3.6);
    const position = geometry.getAttribute('position');
    let edgeCount = 0;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      if (Math.abs(Math.abs(x) - width / 2) < 1e-6) {
        expect(position.getZ(i)).toBeCloseTo(sagitta, 6);
        edgeCount++;
      }
      if (Math.abs(x) < 1e-9) expect(position.getZ(i)).toBeCloseTo(0, 9);
    }
    expect(edgeCount).toBeGreaterThan(0);
  });

  it('is centred on the given height', () => {
    const box = boundsOf(buildScreenGeometry(11.5, 4.8, 0, 3.6));
    expect((box.min.y + box.max.y) / 2).toBeCloseTo(3.6, 6);
    expect(box.max.y - box.min.y).toBeCloseTo(4.8, 6);
  });
});

describe('room parts', () => {
  it('raises the rows with their elevation', () => {
    const platforms = buildPlatforms(fixtureLayout);
    expect(platforms).not.toBeNull();
    const top = Math.max(...fixtureLayout.rows.map((row) => row.elevation));
    expect(boundsOf(platforms!).max.y).toBeCloseTo(top, 6);
  });

  it('builds the curtains', () => {
    expect(buildCurtains(14, 8)).not.toBeNull();
  });
});
