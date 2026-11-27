import type { HallLayout, Vec3 } from '@cinema-hall/core';
import { balconyParts, type BalconyPart } from './geometry.js';
import { DEFAULT_FOV, degToRad } from './math.js';
import type { CameraPose } from './types.js';

/** An axis-aligned box in hall metres. */
export type Box = Pick<BalconyPart, 'minX' | 'maxX' | 'minY' | 'maxY' | 'minZ' | 'maxZ'>;

/**
 * Whether a point is inside a box (the faces count as inside).
 * @param point Point in hall metres.
 * @param box The box.
 * @param margin Grows the box on every side, metres.
 * @returns True when the point is in the (grown) box.
 */
export function insideBox(point: Vec3, box: Box, margin = 0): boolean {
  return (
    point.x >= box.minX - margin &&
    point.x <= box.maxX + margin &&
    point.y >= box.minY - margin &&
    point.y <= box.maxY + margin &&
    point.z >= box.minZ - margin &&
    point.z <= box.maxZ + margin
  );
}

/**
 * Whether the straight line from `from` to `to` passes through a box (slab test). The last
 * `endGap` metres before `to` are not checked, so a point that stands on a box (a seat on its
 * balcony step) is not hidden by it.
 * @param from Start of the line (the camera).
 * @param to End of the line (what the camera looks at).
 * @param box The box.
 * @param endGap Metres before `to` left out of the test.
 * @returns True when the line crosses the box.
 */
export function segmentHitsBox(from: Vec3, to: Vec3, box: Box, endGap = 0.05): boolean {
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const length = Math.hypot(d.x, d.y, d.z);
  if (length === 0) return insideBox(from, box);
  let near = 0;
  let far = Math.max(0, 1 - endGap / length);
  for (const axis of ['x', 'y', 'z'] as const) {
    const min = axis === 'x' ? box.minX : axis === 'y' ? box.minY : box.minZ;
    const max = axis === 'x' ? box.maxX : axis === 'y' ? box.maxY : box.maxZ;
    if (Math.abs(d[axis]) < 1e-12) {
      if (from[axis] < min || from[axis] > max) return false;
      continue;
    }
    let t1 = (min - from[axis]) / d[axis];
    let t2 = (max - from[axis]) / d[axis];
    if (t1 > t2) [t1, t2] = [t2, t1];
    near = Math.max(near, t1);
    far = Math.min(far, t2);
    if (near > far) return false;
  }
  return true;
}

/**
 * Where a point lands on the picture of a camera, in normalised device coordinates: -1…1 across
 * and up the picture, `null` behind the camera.
 * @param pose The camera.
 * @param point Point in hall metres.
 * @param fov Vertical field of view, degrees.
 * @param aspect Width / height of the picture.
 * @returns The point on the picture, or null.
 */
export function projectPoint(
  pose: CameraPose,
  point: Vec3,
  fov: number,
  aspect: number,
): { x: number; y: number } | null {
  const f = normalise(sub(pose.target, pose.position));
  const r = normalise(cross(f, { x: 0, y: 1, z: 0 }));
  const u = cross(r, f);
  const rel = sub(point, pose.position);
  const depth = dot(rel, f);
  if (depth <= 1e-6) return null;
  const tan = Math.tan(degToRad(fov) / 2);
  return { x: dot(rel, r) / (depth * tan * aspect), y: dot(rel, u) / (depth * tan) };
}

/**
 * Whether a camera sees a point: it is on the picture (within `margin` of its edges) and no part
 * of a balcony stands between them.
 * @param pose The camera.
 * @param point Point in hall metres.
 * @param boxes What can hide the point (the balcony parts).
 * @param fov Vertical field of view, degrees.
 * @param aspect Width / height of the picture.
 * @param margin Largest distance from the picture centre, 1 being the edge.
 * @returns True when the point can be seen.
 */
export function seesPoint(
  pose: CameraPose,
  point: Vec3,
  boxes: readonly Box[],
  fov: number,
  aspect: number,
  margin = 1,
): boolean {
  const onScreen = projectPoint(pose, point, fov, aspect);
  if (!onScreen || Math.abs(onScreen.x) > margin || Math.abs(onScreen.y) > margin) return false;
  return !boxes.some((box) => segmentHitsBox(pose.position, point, box));
}

/**
 * The points an overview of the hall should show: the screen's corners and centre, and every seat
 * (at about the height of its back).
 * @param layout Built hall layout.
 * @returns The screen points and the seat points.
 */
export function overviewSamples(layout: HallLayout): { screen: Vec3[]; seats: Vec3[] } {
  const { center, width, height } = layout.screen;
  const screen = [{ ...center }];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      screen.push({ x: center.x + (sx * width) / 2, y: center.y + (sy * height) / 2, z: center.z });
    }
  }
  const seats = layout.seats.map((seat) => ({
    x: seat.position.x,
    y: seat.position.y + 0.9,
    z: seat.position.z,
  }));
  return { screen, seats };
}

/** Elevations of the editor camera above the hall floor, degrees, from the lowest. */
const EDITOR_ELEVATIONS = [32, 40, 48, 56, 64] as const;
/** Angles of the editor camera from the hall's centre line, degrees, towards the right wall. */
const EDITOR_AZIMUTHS = [28, 18, 38] as const;

/**
 * The opening camera of the constructor's 3D view: an elevated view from behind and to the right
 * of the audience that holds the whole hall box (screen, every level, the walls) in the picture.
 * The camera may stand behind the back wall or above the ceiling: the walls and the ceiling face
 * into the hall and are not drawn from outside, so the view is a cutaway. Of the candidate angles,
 * the lowest one that sees the screen and the most seats (a balcony hides the seats under it from
 * high up, so a steeper angle is chosen for halls with balconies) wins.
 * @param layout Built hall layout.
 * @param aspect Width / height of the canvas.
 * @param fov Vertical field of view, degrees.
 * @returns The pose; the target is the middle of the hall, near the floor.
 */
export function editorOverviewPose(
  layout: HallLayout,
  aspect = 16 / 9,
  fov: number = DEFAULT_FOV,
): CameraPose {
  const { hall } = layout;
  const ratio = Number.isFinite(aspect) && aspect > 0.2 ? aspect : 16 / 9;
  const target = { x: 0, y: hall.height * 0.25, z: hall.depth * 0.5 };
  const corners: Vec3[] = [];
  for (const x of [-hall.width / 2, hall.width / 2]) {
    for (const y of [0, hall.height]) {
      for (const z of [0, hall.depth]) corners.push({ x, y, z });
    }
  }
  const boxes = balconyParts(layout);
  const samples = overviewSamples(layout);
  let best: { pose: CameraPose; score: number } | null = null;
  for (const elevation of EDITOR_ELEVATIONS) {
    for (const azimuth of EDITOR_AZIMUTHS) {
      const e = degToRad(elevation);
      const a = degToRad(azimuth);
      const dir = { x: Math.sin(a) * Math.cos(e), y: Math.sin(e), z: Math.cos(a) * Math.cos(e) };
      const pose = fitDistance(target, dir, corners, fov, ratio);
      const screen = samples.screen.filter((p) => seesPoint(pose, p, boxes, fov, ratio)).length;
      const seats = samples.seats.filter((p) => seesPoint(pose, p, boxes, fov, ratio)).length;
      // The screen counts more than any number of seats: an overview without it is no overview.
      const score = screen * (samples.seats.length + 1) + seats;
      if (best === null || score > best.score) best = { pose, score };
    }
  }
  return best!.pose;
}

/** The nearest camera along `dir` from `target` that holds every corner in the picture. */
function fitDistance(
  target: Vec3,
  dir: Vec3,
  corners: readonly Vec3[],
  fov: number,
  aspect: number,
): CameraPose {
  const at = (distance: number): CameraPose => ({
    position: {
      x: target.x + dir.x * distance,
      y: target.y + dir.y * distance,
      z: target.z + dir.z * distance,
    },
    target: { ...target },
  });
  const fits = (distance: number) =>
    corners.every((corner) => {
      const p = projectPoint(at(distance), corner, fov, aspect);
      return p !== null && Math.abs(p.x) <= 0.94 && Math.abs(p.y) <= 0.94;
    });
  let low = 1;
  let high = 4;
  while (!fits(high) && high < 400) high *= 1.5;
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    if (fits(mid)) high = mid;
    else low = mid;
  }
  const pose = at(high);
  return {
    position: {
      x: round(pose.position.x),
      y: round(pose.position.y),
      z: round(pose.position.z),
    },
    target: pose.target,
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function normalise(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}
