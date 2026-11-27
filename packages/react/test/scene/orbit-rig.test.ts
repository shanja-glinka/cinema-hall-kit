import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { buildHallLayout } from '@cinema-hall/core';
import {
  confineOrbit,
  orbitBounds,
  orbitRange,
  settleOrbit,
} from '../../src/seat-view/orbit-rig.js';
import { editorOverviewPose } from '../../src/scene/overview.js';
import { DEFAULT_FOV } from '../../src/scene/math.js';
import { fixtureConfig, fixtureLayout } from './fixtures.js';

const hall = fixtureLayout.hall;

// The eye may leave the hall over the side walls, the back wall and the ceiling (the walls and
// the ceiling face into the hall, so from outside the hall is a cutaway), within a few hall sizes.
// It never goes below the floor or in front of the screen wall, and the target stays in the hall.
describe('orbit camera bounds', () => {
  const reach = Math.max(hall.width, hall.depth, hall.height) * 2.5;

  it('keeps the eye above the floor, behind the screen wall and within reach, the target in the hall', () => {
    const out = confineOrbit({ x: 999, y: -1, z: -5 }, { x: 99, y: 99, z: -3 }, hall);
    expect(out.eye).toEqual({ x: hall.width / 2 + reach, y: 0.6, z: 0.3 });
    expect(out.aim).toEqual({ x: hall.width / 2 - 0.4, y: hall.height, z: 0 });
  });

  it('lets the eye stand behind the back wall and above the ceiling (the cutaway view)', () => {
    const eye = { x: hall.width, y: hall.height + 5, z: hall.depth + 6 };
    expect(confineOrbit(eye, { x: 0, y: 1, z: 5 }, hall).eye).toEqual(eye);
    const bounds = orbitBounds(hall);
    expect(bounds.eye.max.z).toBeGreaterThan(hall.depth);
    expect(bounds.eye.max.y).toBeGreaterThan(hall.height);
  });

  it('confines the view after the controls move the camera, so a pan cannot lose the hall', () => {
    const camera = { position: new Vector3(0, 1.5, 4), lookAt: vi.fn() };
    const controls = {
      target: new Vector3(0, 1.5, 0),
      update: vi.fn(() => {
        camera.position.set(hall.width * 30, 1.5, 4);
        controls.target.set(hall.width * 30, 1.5, 0);
        return true;
      }),
    };
    expect(settleOrbit(controls, camera, hall)).toBe(true);
    expect(camera.position.x).toBeLessThanOrEqual(hall.width / 2 + reach);
    expect(controls.target.x).toBeLessThanOrEqual(hall.width / 2 - 0.4);
    expect(camera.lookAt).toHaveBeenLastCalledWith(
      controls.target.x,
      controls.target.y,
      controls.target.z,
    );
  });
});

// The preview's far plane follows the hall, so a large hall seen from the opening
// view (or zoomed out to the limit) is not clipped by the usual 150 m far plane.
describe('preview far plane', () => {
  const big = buildHallLayout({ ...fixtureConfig, hall: { width: 180, depth: 60, height: 20 } });
  const aspect = 0.55;
  const pose = editorOverviewPose(big, aspect, DEFAULT_FOV);
  const opening = Math.hypot(
    pose.position.x - pose.target.x,
    pose.position.y - pose.target.y,
    pose.position.z - pose.target.z,
  );
  const depthOf = (p: { x: number; y: number; z: number }) => {
    const f = {
      x: pose.target.x - pose.position.x,
      y: pose.target.y - pose.position.y,
      z: pose.target.z - pose.position.z,
    };
    const len = Math.hypot(f.x, f.y, f.z);
    return (
      ((p.x - pose.position.x) * f.x +
        (p.y - pose.position.y) * f.y +
        (p.z - pose.position.z) * f.z) /
      len
    );
  };

  it('reaches every seat and the screen of a 180 m hall in a narrow view', () => {
    const { far, maxDistance } = orbitRange(big.hall, opening);
    const farthest = Math.max(
      ...big.seats.map((s) => depthOf(s.position)),
      depthOf(big.screen.center),
    );
    expect(farthest).toBeGreaterThan(150);
    expect(far).toBeGreaterThan(farthest);
    // Zoomed out to the limit, the far side of the hall is still within the far plane.
    expect(far).toBeGreaterThanOrEqual(maxDistance + Math.hypot(180, 60, 20));
  });

  it('keeps the usual far plane for a small hall', () => {
    expect(orbitRange(fixtureLayout.hall, 20).far).toBe(150);
  });
});
