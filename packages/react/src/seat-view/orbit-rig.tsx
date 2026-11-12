import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { HallLayout, Vec3 } from '@cinema-hall/core';
import { clampVec, overviewPose } from '../scene/math.js';

type Hall = HallLayout['hall'];

/**
 * Where the orbit camera may be and where it may look. The eye stays inside the hall, a little off the walls
 * and above the floor; the target stays between the walls, from the floor up to the ceiling.
 */
export function orbitBounds(hall: Hall): {
  eye: { min: Vec3; max: Vec3 };
  aim: { min: Vec3; max: Vec3 };
} {
  return {
    eye: {
      min: { x: -hall.width / 2 + 0.4, y: 0.6, z: 0.3 },
      max: { x: hall.width / 2 - 0.4, y: hall.height - 0.2, z: hall.depth - 0.2 },
    },
    aim: {
      min: { x: -hall.width / 2 + 0.4, y: 0, z: 0 },
      max: { x: hall.width / 2 - 0.4, y: hall.height, z: hall.depth },
    },
  };
}

/** Confines an eye point and a target to the hall. */
export function confineOrbit(eye: Vec3, aim: Vec3, hall: Hall): { eye: Vec3; aim: Vec3 } {
  const bounds = orbitBounds(hall);
  return {
    eye: clampVec(eye, bounds.eye.min, bounds.eye.max),
    aim: clampVec(aim, bounds.aim.min, bounds.aim.max),
  };
}

/** The part of OrbitControls one frame uses. */
export interface OrbitControlsLike {
  update(): boolean;
  target: Vector3;
}

/** The part of a camera one frame uses. */
export interface OrbitCameraLike {
  position: Vector3;
  lookAt(x: number, y: number, z: number): void;
}

/**
 * One frame of the orbit: the controls move the camera first (damping, pans, zooms), and the bounds are
 * applied to where they leave it, so a pan cannot cross a wall. The controls' target is kept in step.
 * Returns whether the controls moved.
 */
export function settleOrbit(
  controls: OrbitControlsLike,
  camera: OrbitCameraLike,
  hall: Hall,
): boolean {
  const moved = controls.update();
  const confined = confineOrbit(
    { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    { x: controls.target.x, y: controls.target.y, z: controls.target.z },
    hall,
  );
  camera.position.set(confined.eye.x, confined.eye.y, confined.eye.z);
  controls.target.set(confined.aim.x, confined.aim.y, confined.aim.z);
  camera.lookAt(confined.aim.x, confined.aim.y, confined.aim.z);
  return moved;
}

/** Orbit camera for the hall preview: starts from the overview, stays inside the hall. */
export function OrbitRig({ layout }: { layout: HallLayout }): null {
  const { camera, gl, invalidate } = useThree();
  const layoutRef = useRef(layout);
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    const start = overviewPose(layoutRef.current);
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.minDistance = 1.5;
    controls.maxDistance =
      Math.max(layoutRef.current.hall.width, layoutRef.current.hall.depth) * 1.5;
    controls.target.set(start.target.x, start.target.y, start.target.z);
    camera.position.set(start.position.x, start.position.y, start.position.z);
    controls.update();
    const onChange = () => invalidate();
    controls.addEventListener('change', onChange);
    controlsRef.current = controls;
    invalidate();
    return () => {
      controls.removeEventListener('change', onChange);
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl, invalidate]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (settleOrbit(controls, camera, layoutRef.current.hall)) invalidate();
  });

  return null;
}
