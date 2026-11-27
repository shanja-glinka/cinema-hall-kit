import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildHallLayout,
  builtInTemplates,
  parseHallConfig,
  type HallConfig,
  type HallLayout,
} from '@cinema-hall/core';
import { balconyParts } from '../../src/scene/geometry.js';
import { balconyFrontZ, overviewPose } from '../../src/scene/math.js';
import {
  editorOverviewPose,
  insideBox,
  overviewSamples,
  projectPoint,
  seesPoint,
  segmentHitsBox,
} from '../../src/scene/overview.js';
import { confineOrbit } from '../../src/seat-view/orbit-rig.js';
import { EDITOR_LIGHT, editorFog } from '../../src/scene/editor-lighting.js';

// Relative to the package directory, where vitest runs. A two-level hall with a balcony.
const parsed = parseHallConfig(readFileSync('test/scene/fixtures/two-level-hall.yaml', 'utf8')) as
  HallConfig | { config: HallConfig };
const twoLevelHall = buildHallLayout('config' in parsed ? parsed.config : parsed);
const template = (id: string): HallLayout => {
  const found = builtInTemplates.find((item) => item.id === id);
  if (!found) throw new Error(`no template ${id}`);
  return buildHallLayout(found.create());
};
const twoLevel: [string, HallLayout][] = [
  ['balcony template', template('balcony')],
  ['two-level-hall.yaml', twoLevelHall],
];
const all: [string, HallLayout][] = [
  ...builtInTemplates.map((item): [string, HallLayout] => [item.id, template(item.id)]),
  ['two-level-hall.yaml', twoLevelHall],
];

describe('segmentHitsBox', () => {
  const box = { minX: -1, maxX: 1, minY: 0, maxY: 1, minZ: 4, maxZ: 5 };
  it('finds a line through a box and misses one beside or over it', () => {
    expect(segmentHitsBox({ x: 0, y: 0.5, z: 10 }, { x: 0, y: 0.5, z: 0 }, box)).toBe(true);
    expect(segmentHitsBox({ x: 3, y: 0.5, z: 10 }, { x: 3, y: 0.5, z: 0 }, box)).toBe(false);
    expect(segmentHitsBox({ x: 0, y: 2, z: 10 }, { x: 0, y: 2, z: 0 }, box)).toBe(false);
    // A line that ends before the box does not reach it.
    expect(segmentHitsBox({ x: 0, y: 0.5, z: 10 }, { x: 0, y: 0.5, z: 6 }, box)).toBe(false);
  });
});

describe('the booking overview of a hall with a balcony', () => {
  it.each(twoLevel)(
    '%s: stands in front of the balcony, under the ceiling, with a clear line to the screen',
    (_, layout) => {
      const pose = overviewPose(layout);
      const parts = balconyParts(layout);
      expect(parts.length).toBeGreaterThan(0);
      const front = balconyFrontZ(layout)!;
      // Not inside (or right against) any slab, step, riser, front wall or column.
      for (const part of parts) expect(insideBox(pose.position, part, 0.3)).toBe(false);
      // In front of every balcony: nothing of a balcony between the camera and the screen.
      expect(pose.position.z).toBeLessThan(front);
      expect(pose.position.y).toBeLessThan(layout.hall.height);
      for (const part of parts) {
        expect(segmentHitsBox(pose.position, layout.screen.center, part)).toBe(false);
      }
    },
  );

  it.each(twoLevel)(
    '%s: shows the whole screen and the stalls in front of the balcony',
    (_, layout) => {
      const pose = overviewPose(layout);
      const parts = balconyParts(layout);
      const samples = overviewSamples(layout);
      for (const corner of samples.screen)
        expect(seesPoint(pose, corner, parts, 60, 1.3)).toBe(true);
      const stalls = layout.seats.filter((seat) => seat.level === 0);
      const seen = stalls.filter((seat) =>
        seesPoint(pose, { ...seat.position, y: seat.position.y + 0.9 }, parts, 60, 1.3),
      );
      expect(seen.length).toBeGreaterThanOrEqual(30);
      // Well above the heads of the seats under it, never among the seat backs.
      for (const seat of layout.seats) {
        const near =
          Math.abs(seat.position.z - pose.position.z) < 2 && Math.abs(seat.position.x) < 2;
        if (near) expect(pose.position.y).toBeGreaterThan(seat.eye.y + 1);
      }
    },
  );

  it('keeps the old overview for a hall with one level', () => {
    const layout = template('threeSections');
    expect(overviewPose(layout)).toEqual({
      position: { x: 0, y: layout.hall.height * 0.8, z: layout.hall.depth - 0.6 },
      target: layout.screen.center,
    });
  });
});

describe('the opening camera of the editor 3D view', () => {
  it.each(all)('%s: holds the whole hall box and the whole screen in the picture', (_, layout) => {
    for (const aspect of [1.9, 1.3, 0.8]) {
      const pose = editorOverviewPose(layout, aspect);
      const { width, depth, height } = layout.hall;
      for (const x of [-width / 2, width / 2]) {
        for (const y of [0, height]) {
          for (const z of [0, depth]) {
            const p = projectPoint(pose, { x, y, z }, 60, aspect);
            expect(p).not.toBeNull();
            expect(Math.abs(p!.x)).toBeLessThanOrEqual(1);
            expect(Math.abs(p!.y)).toBeLessThanOrEqual(1);
          }
        }
      }
      const parts = balconyParts(layout);
      for (const corner of overviewSamples(layout).screen) {
        expect(seesPoint(pose, corner, parts, 60, aspect)).toBe(true);
      }
    }
  });

  it.each(all)(
    '%s: looks from above and behind, far from every seat, within the orbit bounds',
    (_, layout) => {
      const pose = editorOverviewPose(layout, 1.9);
      expect(pose.position.y).toBeGreaterThan(layout.hall.height);
      expect(pose.position.z).toBeGreaterThan(pose.target.z);
      for (const seat of layout.seats) {
        const d = Math.hypot(
          seat.eye.x - pose.position.x,
          seat.eye.y - pose.position.y,
          seat.eye.z - pose.position.z,
        );
        expect(d).toBeGreaterThan(5);
      }
      const confined = confineOrbit(pose.position, pose.target, layout.hall);
      expect(confined.eye).toEqual(pose.position);
      expect(confined.aim).toEqual(pose.target);
    },
  );

  it('sees every seat of a one-level hall, and every balcony seat and most seats of a two-level one', () => {
    const single = template('threeSections');
    const pose = editorOverviewPose(single, 1.9);
    const samples = overviewSamples(single);
    expect(samples.seats.every((p) => seesPoint(pose, p, [], 60, 1.9))).toBe(true);
    for (const [, layout] of twoLevel) {
      const view = editorOverviewPose(layout, 1.9);
      const parts = balconyParts(layout);
      const seen = layout.seats.filter((seat) =>
        seesPoint(view, { ...seat.position, y: seat.position.y + 0.9 }, parts, 60, 1.9),
      );
      expect(seen.filter((seat) => (seat.level ?? 0) > 0).length).toBe(
        layout.seats.filter((seat) => (seat.level ?? 0) > 0).length,
      );
      expect(seen.length / layout.seats.length).toBeGreaterThan(0.6);
    }
  });

  it('lights the editor brighter, and keeps the fog beyond the cutaway view', () => {
    expect(EDITOR_LIGHT.ambient).toBeGreaterThanOrEqual(0.9);
    expect(EDITOR_LIGHT.key).toBeGreaterThanOrEqual(1.5);
    const layout = template('balcony');
    const pose = editorOverviewPose(layout, 0.8);
    const { width, depth } = layout.hall;
    const farthest = Math.max(
      ...[-width / 2, width / 2].flatMap((x) =>
        [0, depth].map((z) =>
          Math.hypot(x - pose.position.x, pose.position.y, z - pose.position.z),
        ),
      ),
    );
    expect(editorFog(layout.hall).near).toBeGreaterThan(farthest);
  });
});
