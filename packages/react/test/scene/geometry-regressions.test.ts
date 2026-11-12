import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Texture,
} from 'three';
import { buildHallLayout, type HallConfig } from '@cinema-hall/core';
import {
  buildPlatforms,
  buildProceduralSeat,
  buildSeatModelGeometry,
  disposeModel,
  platformSpans,
} from '../../src/scene/geometry.js';
import { fixtureConfig, fixtureLayout } from './fixtures.js';

afterEach(() => {
  vi.restoreAllMocks();
});

/** The fixture, with the centre section of the main band at its own row spacing. */
function mixedSpacingLayout() {
  const config: HallConfig = structuredClone(fixtureConfig);
  const centre = config.layout.bands[0]?.sections[1];
  if (!centre) throw new Error('the fixture changed: no centre section');
  centre.rowSpacing = 1.3;
  return buildHallLayout(config);
}

describe('raised floor', () => {
  it('gives every seat of a raised row a platform at its own section z and row spacing', () => {
    const layout = mixedSpacingLayout();
    const spans = platformSpans(layout);
    let checked = 0;
    for (const row of layout.rows) {
      if (row.elevation <= 0.001) continue;
      for (const key of row.seatKeys) {
        const seat = layout.seats.find((s) => s.key === key);
        if (!seat) continue;
        const span = spans.find(
          (s) =>
            s.height === row.elevation &&
            seat.position.x >= s.left - 1e-9 &&
            seat.position.x <= s.right + 1e-9 &&
            Math.abs(seat.position.z - s.z) < 1e-9,
        );
        expect(span, `a platform under seat ${seat.key}`).toBeDefined();
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('spans of one row meet at the midpoints, so the row has no gap', () => {
    const spans = platformSpans(mixedSpacingLayout());
    const byHeight = new Map<number, typeof spans>();
    for (const span of spans) {
      const list = byHeight.get(span.height) ?? [];
      list.push(span);
      byHeight.set(span.height, list);
    }
    for (const list of byHeight.values()) {
      const sorted = [...list].sort((a, b) => a.left - b.left);
      for (let i = 1; i < sorted.length; i++) {
        const previous = sorted[i - 1];
        const current = sorted[i];
        if (!previous || !current || previous.z !== current.z) continue;
        expect(current.left).toBeCloseTo(previous.right, 9);
      }
    }
  });

  it('builds one merged box set that tops out at the highest row', () => {
    const geometry = buildPlatforms(fixtureLayout);
    expect(geometry).not.toBeNull();
    const top = Math.max(...fixtureLayout.rows.map((row) => row.elevation));
    geometry?.computeBoundingBox();
    expect(geometry?.boundingBox?.max.y).toBeCloseTo(top, 6);
  });
});

describe('merge intermediates', () => {
  it('frees every part of a merged seat, and keeps the merged result', () => {
    const disposed = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const seat = buildProceduralSeat(0.55, 0.6);
    expect(disposed.mock.contexts.length).toBeGreaterThan(0);
    expect(disposed.mock.contexts).not.toContain(seat);
  });

  it('frees a loaded model: its geometries, materials and their textures', () => {
    const root = new Group();
    const geometry = new BoxGeometry(1, 1, 1);
    const map = new Texture();
    const material = new MeshStandardMaterial({ map });
    root.add(new Mesh(geometry, material));
    const freed = { geometry: false, material: false, texture: false };
    geometry.addEventListener('dispose', () => {
      freed.geometry = true;
    });
    material.addEventListener('dispose', () => {
      freed.material = true;
    });
    map.addEventListener('dispose', () => {
      freed.texture = true;
    });
    disposeModel(root);
    expect(freed).toEqual({ geometry: true, material: true, texture: true });
  });
});

describe('GLB vertex colours', () => {
  function modelWithParts(): Group {
    const root = new Group();
    const trim = new BoxGeometry(1, 1, 1);
    const count = trim.getAttribute('position').count;
    const trimColours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) trimColours.set([0.5, 0.25, 0.1], i * 3);
    trim.setAttribute('color', new BufferAttribute(trimColours, 3));
    root.add(new Mesh(trim, new MeshStandardMaterial({ name: 'Trim', color: new Color(1, 1, 1) })));

    const upholstery = new BoxGeometry(1, 1, 1);
    root.add(
      new Mesh(upholstery, new MeshStandardMaterial({ name: 'Seat', color: new Color(0, 0, 0) })),
    );
    return root;
  }

  it('keeps the own colours of a fixed part, and makes the tinted part white', () => {
    const result = buildSeatModelGeometry(modelWithParts(), 1, 'Seat');
    const fixed = result?.fixed;
    const tinted = result?.tinted;
    if (!fixed || !tinted) throw new Error('both parts expected');
    const fixedColours = fixed.getAttribute('color');
    expect(fixedColours.getX(0)).toBeCloseTo(0.5, 6);
    expect(fixedColours.getY(0)).toBeCloseTo(0.25, 6);
    expect(fixedColours.getZ(0)).toBeCloseTo(0.1, 6);
    const tintedColours = tinted.getAttribute('color');
    expect(tintedColours.getX(0)).toBe(1);
    expect(tintedColours.getY(0)).toBe(1);
    expect(tintedColours.getZ(0)).toBe(1);
  });

  it('bakes the material colour into a fixed part without own colours', () => {
    const root = new Group();
    root.add(
      new Mesh(
        new BoxGeometry(1, 1, 1),
        new MeshStandardMaterial({ name: 'Trim', color: new Color(0.5, 0.5, 0.5) }),
      ),
    );
    const fixed = buildSeatModelGeometry(root, 1, 'Seat')?.fixed;
    expect(fixed?.getAttribute('color').getX(0)).toBeCloseTo(0.5, 6);
  });
});
