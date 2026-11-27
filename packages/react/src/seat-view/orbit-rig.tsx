import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { HallLayout, Vec3 } from '@cinema-hall/core';
import { clampVec, DEFAULT_FOV } from '../scene/math.js';
import { editorOverviewPose } from '../scene/overview.js';

type Hall = HallLayout['hall'];

/**
 * How far the orbit eye may go outside the hall's side walls, back wall and ceiling, as a multiple
 * of the hall's largest size. The walls and the ceiling face into the hall and are not drawn from
 * outside, so from out there the hall is seen as a cutaway (see `editorOverviewPose`).
 */
const OUTSIDE_REACH = 2.5;

/**
 * Where the orbit camera may be and where it may look. The eye stays above the floor and behind the
 * screen wall, and may leave the hall over the side walls, the back wall and the ceiling (the hall
 * is then seen as a cutaway), up to a few hall sizes away; the target stays between the walls, from
 * the floor up to the ceiling, so the hall stays in the middle of the view.
 */
export function orbitBounds(hall: Hall): {
  eye: { min: Vec3; max: Vec3 };
  aim: { min: Vec3; max: Vec3 };
} {
  const reach = Math.max(hall.width, hall.depth, hall.height) * OUTSIDE_REACH;
  return {
    eye: {
      min: { x: -hall.width / 2 - reach, y: 0.6, z: 0.3 },
      max: { x: hall.width / 2 + reach, y: hall.height + reach, z: hall.depth + reach },
    },
    aim: {
      min: { x: -hall.width / 2 + 0.4, y: 0, z: 0 },
      max: { x: hall.width / 2 - 0.4, y: hall.height, z: hall.depth },
    },
  };
}

/**
 * How far the orbit camera may zoom out, and the far plane that keeps the whole hall drawn from
 * there: the target stays in the hall and the eye within `maxDistance` of it, so no part of the
 * hall is further from the eye than `maxDistance` plus the hall's diagonal.
 * @param hall The hall's size, metres.
 * @param opening Distance from the opening view's eye to its target, metres.
 * @param baseFar The far plane the view uses for small halls, metres.
 * @returns The largest eye-to-target distance and the far plane, metres.
 */
export function orbitRange(
  hall: Hall,
  opening: number,
  baseFar = 150,
): { maxDistance: number; far: number } {
  // Room to zoom out a little past the opening view.
  const maxDistance = Math.max(Math.max(hall.width, hall.depth) * 1.5, opening * 1.4);
  const diagonal = Math.hypot(hall.width, hall.depth, hall.height);
  return { maxDistance, far: Math.max(baseFar, (maxDistance + diagonal) * 1.05) };
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

/**
 * Orbit camera for the hall preview: starts from an elevated cutaway view that holds the whole hall
 * (`editorOverviewPose`), and keeps the target inside the hall.
 */
export function OrbitRig({ layout }: { layout: HallLayout }): null {
  const { camera, gl, invalidate, size } = useThree();
  const aspectRef = useRef(size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9);
  const layoutRef = useRef(layout);
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    const hall = layoutRef.current.hall;
    const fov = 'fov' in camera && typeof camera.fov === 'number' ? camera.fov : DEFAULT_FOV;
    const start = editorOverviewPose(layoutRef.current, aspectRef.current, fov);
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.minDistance = 1.5;
    const opening = Math.hypot(
      start.position.x - start.target.x,
      start.position.y - start.target.y,
      start.position.z - start.target.z,
    );
    const range = orbitRange(hall, opening);
    controls.maxDistance = range.maxDistance;
    // A large hall seen from the opening view can lie past the view's usual far plane.
    if ('far' in camera && 'updateProjectionMatrix' in camera && camera.far < range.far) {
      camera.far = range.far;
      camera.updateProjectionMatrix();
    }
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
