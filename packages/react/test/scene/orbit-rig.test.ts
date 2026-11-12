import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { confineOrbit, settleOrbit } from '../../src/seat-view/orbit-rig.js';
import { fixtureLayout } from './fixtures.js';

const hall = fixtureLayout.hall;

describe('orbit camera bounds', () => {
  it('confines the eye and the target to the hall', () => {
    const out = confineOrbit({ x: 99, y: -1, z: -5 }, { x: 99, y: 99, z: -3 }, hall);
    expect(out.eye).toEqual({ x: hall.width / 2 - 0.4, y: 0.6, z: 0.3 });
    expect(out.aim).toEqual({ x: hall.width / 2 - 0.4, y: hall.height, z: 0 });
  });

  it('confines the view after the controls move the camera, so a pan cannot cross a wall', () => {
    const camera = { position: new Vector3(0, 1.5, 4), lookAt: vi.fn() };
    const controls = {
      target: new Vector3(0, 1.5, 0),
      update: vi.fn(() => {
        camera.position.set(hall.width * 3, 1.5, 4);
        controls.target.set(hall.width * 3, 1.5, 0);
        return true;
      }),
    };
    expect(settleOrbit(controls, camera, hall)).toBe(true);
    expect(camera.position.x).toBeLessThanOrEqual(hall.width / 2 - 0.4);
    expect(controls.target.x).toBeLessThanOrEqual(hall.width / 2 - 0.4);
    expect(camera.lookAt).toHaveBeenLastCalledWith(
      controls.target.x,
      controls.target.y,
      controls.target.z,
    );
  });
});
