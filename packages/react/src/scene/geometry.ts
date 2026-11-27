import type { BufferGeometry, Material } from 'three';
import {
  BoxGeometry,
  BufferAttribute,
  CapsuleGeometry,
  CircleGeometry,
  Matrix4,
  Mesh,
  PlaneGeometry,
  SphereGeometry,
  Texture,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BALCONY_PARAPET_THICKNESS,
  balconySlabSteps,
  DEFAULT_CONSTRAINTS,
  type BalconySlabStep,
  type HallLayout,
  type Seat,
} from '@cinema-hall/core';
import { curvedScreenZ, HEAD_RADIUS, SEAT_TOP } from './math.js';

type Rgb = readonly [number, number, number];

/** Vertex colours multiply the instance colour: the upholstery is white, the trim is dark. */
const SHELL: Rgb = [1, 1, 1];
const TRIM: Rgb = [0.2, 0.14, 0.11];
/**
 * Metres a platform reaches past its outermost seats of a section (on each side, where no neighbour
 * is).
 */
const PLATFORM_MARGIN = 0.3;
/** Row spacing in metres, for a section that is missing from the layout. */
const DEFAULT_ROW_SPACING = 1;

/**
 * A seat type as instanced meshes: `tinted` takes the instance colour, `fixed` keeps its own
 * colours.
 */
export interface SeatGeometry {
  tinted: BufferGeometry | null;
  fixed: BufferGeometry | null;
}

/**
 * Frees both geometries of a seat, and their GPU buffers. The materials belong to the caller and
 * are not touched.
 */
export function disposeSeatGeometry(seat: SeatGeometry): void {
  seat.tinted?.dispose();
  seat.fixed?.dispose();
}

/**
 * Frees what a loaded model owns: its geometries, its materials and their textures. Call it once
 * the parts
 * have been merged; the merge copies everything the scene draws.
 */
export function disposeModel(root: Object3D): void {
  root.traverse((node) => {
    (node as { geometry?: BufferGeometry }).geometry?.dispose();
    const materials = (node as { material?: Material | Material[] }).material;
    for (const material of Array.isArray(materials) ? materials : [materials]) {
      if (!material) continue;
      for (const value of Object.values(material) as unknown[]) {
        if (value instanceof Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

/** Writes a constant vertex colour; the geometry must have a position attribute. */
function tintVertices<G extends BufferGeometry>(geometry: G, rgb: Rgb): G {
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = rgb[0];
    colors[i * 3 + 1] = rgb[1];
    colors[i * 3 + 2] = rgb[2];
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

/**
 * Merges parts into one new geometry. The parts are intermediates, so they are freed here: the
 * caller keeps
 * only the result.
 */
function mergeParts(parts: BufferGeometry[]): BufferGeometry | null {
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return merged;
}

/**
 * A procedural seat in metres: origin at the centre of the footprint on the floor, the sitter faces
 * −Z
 * (the screen), the backrest is at +Z. Width and depth come from the seat type; the backrest is
 * 0.98 m high.
 */
export function buildProceduralSeat(width: number, depth: number): BufferGeometry {
  const w = Math.max(width, 0.1);
  const d = Math.max(depth, 0.1);
  const parts: BufferGeometry[] = [];
  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, rgb: Rgb) => {
    parts.push(tintVertices(new BoxGeometry(sx, sy, sz).translate(x, y, z), rgb));
  };

  const cushionThickness = 0.1;
  const cushionBack = d / 2 - 0.12;
  box(
    w * 0.94,
    cushionThickness,
    cushionBack + d / 2,
    0,
    SEAT_TOP - cushionThickness / 2,
    (cushionBack - d / 2) / 2,
    SHELL,
  );

  const backBottom = 0.12;
  const backTop = 0.98;
  box(w * 0.94, backTop - backBottom, 0.12, 0, (backTop + backBottom) / 2, d / 2 - 0.06, SHELL);

  box(w * 0.7, backBottom, d * 0.6, 0, backBottom / 2, 0, TRIM);
  box(
    0.06,
    SEAT_TOP - cushionThickness - backBottom,
    0.06,
    0,
    (SEAT_TOP - cushionThickness + backBottom) / 2,
    0,
    TRIM,
  );

  const armX = w / 2 - 0.025;
  const armTop = 0.64;
  for (const side of [-1, 1]) {
    box(0.05, 0.04, d * 0.75, side * armX, armTop, -0.05 * d, TRIM);
    box(
      0.04,
      armTop - 0.02 - backBottom,
      0.04,
      side * armX,
      (armTop - 0.02 + backBottom) / 2,
      -0.25 * d,
      TRIM,
    );
  }

  return mergeParts(parts) ?? new BoxGeometry(w, backTop, d).translate(0, backTop / 2, 0);
}

/**
 * Converts a part to position + normal + one colour per vertex, so that parts can be merged. A
 * tinted part
 * (`fixedColour` null) is white and takes the instance colour. A fixed part keeps its colour: the
 * material
 * colour times the part's own vertex colours. The input is freed when a new geometry replaces it.
 */
function normalizeForMerge(geometry: BufferGeometry, fixedColour: Rgb | null): BufferGeometry {
  const flat = geometry.toNonIndexed();
  if (flat !== geometry) geometry.dispose();
  if (!flat.getAttribute('normal')) flat.computeVertexNormals();
  const own = fixedColour ? flat.getAttribute('color') : undefined;
  const base = fixedColour ?? SHELL;
  const count = flat.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = base[0] * (own ? own.getX(i) : 1);
    colors[i * 3 + 1] = base[1] * (own ? own.getY(i) : 1);
    colors[i * 3 + 2] = base[2] * (own ? own.getZ(i) : 1);
  }
  for (const name of Object.keys(flat.attributes)) {
    if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name);
  }
  flat.setAttribute('color', new BufferAttribute(colors, 3));
  return flat;
}

/**
 * A GLB seat (metres, origin under the seat centre, +Z to the screen) turned to face −Z and scaled.
 * With `tintMaterial`, only that material takes the seat colour; without it the whole model does.
 * The
 * model's own meshes are not changed: the result is new geometry.
 */
export function buildSeatModelGeometry(
  root: Object3D,
  scale: number,
  tintMaterial: string | undefined,
): SeatGeometry | null {
  root.updateMatrixWorld(true);
  const transform = new Matrix4()
    .makeRotationY(Math.PI)
    .multiply(new Matrix4().makeScale(scale, scale, scale));
  const tinted: BufferGeometry[] = [];
  const fixed: BufferGeometry[] = [];
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const placed = node.geometry.clone().applyMatrix4(node.matrixWorld).applyMatrix4(transform);
    const material = Array.isArray(node.material) ? node.material[0] : node.material;
    const isTinted = tintMaterial === undefined || material?.name === tintMaterial;
    if (isTinted) {
      tinted.push(normalizeForMerge(placed, null));
    } else {
      const color = (material as { color?: { r: number; g: number; b: number } } | undefined)
        ?.color;
      fixed.push(normalizeForMerge(placed, color ? [color.r, color.g, color.b] : SHELL));
    }
  });
  const result: SeatGeometry = { tinted: mergeParts(tinted), fixed: mergeParts(fixed) };
  if (!result.tinted && !result.fixed) return null;
  return result;
}

/**
 * Arm-length body: a capsule centred on the origin. Placed at the seated body height by the scene.
 */
export function buildAvatarBody(): BufferGeometry {
  return new CapsuleGeometry(0.16, 0.2, 4, 12);
}

/** A sphere for an avatar's head, with radius `HEAD_RADIUS`, centred on the origin. */
export function buildAvatarHead(): BufferGeometry {
  return new SphereGeometry(HEAD_RADIUS, 14, 10);
}

/**
 * One raised piece of floor: a section's seats in one row, with the z and row spacing of that
 * section.
 */
export interface PlatformSpan {
  /** Extent along X, metres (reaches halfway to the neighbouring section of the row). */
  left: number;
  right: number;
  /** Centre along Z, metres: the z of the section's row. */
  z: number;
  /** Extent along Z, metres: the row spacing of the section. */
  depth: number;
  /** Top of the piece: the elevation of the row. */
  height: number;
}

function sectionKey(bandId: string, sectionId: string): string {
  return `${bandId}\u0000${sectionId}`;
}

/**
 * The raised floor under the rows: one span per section and raised row. A section keeps its own z
 * and row
 * spacing, so sections with different spacing keep their seats on the floor; the spans of one row
 * meet at
 * the midpoints between sections, so the row has no gaps. Rows of an upper level (a band with
 * `level > 0`) are left out: they stand on their balcony (see `balconyParts`).
 */
export function platformSpans(layout: HallLayout): PlatformSpan[] {
  // The rows of an upper level stand on their balcony (see `balconyParts`), not on the hall floor.
  const upper = new Set(
    (layout.bands ?? []).filter((band) => band.level > 0).map((band) => band.id),
  );
  const byKey = new Map<string, Seat>(layout.seats.map((seat) => [seat.key, seat]));
  const spacing = new Map<string, number>();
  for (const section of layout.sections) {
    spacing.set(sectionKey(section.bandId, section.sectionId), section.rowSpacing);
  }
  const spans: PlatformSpan[] = [];
  for (const row of layout.rows) {
    if (row.elevation <= 0.001 || upper.has(row.bandId)) continue;
    const sections = new Map<string, Seat[]>();
    for (const key of row.seatKeys) {
      const seat = byKey.get(key);
      if (!seat) continue;
      const id = sectionKey(seat.bandId, seat.sectionId);
      const list = sections.get(id);
      if (list) list.push(seat);
      else sections.set(id, [seat]);
    }
    const bounds: { minX: number; maxX: number; z: number; depth: number }[] = [];
    for (const [id, seats] of sections) {
      const first = seats[0];
      if (!first) continue;
      let minX = first.position.x;
      let maxX = first.position.x;
      for (const seat of seats) {
        minX = Math.min(minX, seat.position.x);
        maxX = Math.max(maxX, seat.position.x);
      }
      bounds.push({
        minX,
        maxX,
        z: first.position.z,
        depth: spacing.get(id) ?? DEFAULT_ROW_SPACING,
      });
    }
    bounds.sort((a, b) => a.minX - b.minX);
    bounds.forEach((bound, i) => {
      const previous = bounds[i - 1];
      const next = bounds[i + 1];
      spans.push({
        left: previous ? (previous.maxX + bound.minX) / 2 : bound.minX - PLATFORM_MARGIN,
        right: next ? (bound.maxX + next.minX) / 2 : bound.maxX + PLATFORM_MARGIN,
        z: bound.z,
        depth: bound.depth,
        height: row.elevation,
      });
    });
  }
  return spans;
}

/**
 * Stepped floor under the rows: one merged box per section and raised row (see `platformSpans`).
 */
export function buildPlatforms(layout: HallLayout): BufferGeometry | null {
  return mergeParts(
    platformSpans(layout).map((span) =>
      new BoxGeometry(span.right - span.left, span.height, span.depth).translate(
        (span.left + span.right) / 2,
        span.height / 2,
        span.z,
      ),
    ),
  );
}

/** Sizes of a balcony in metres: its floor slab and the front wall (parapet) on it. */
export interface BalconyDimensions {
  /** Thickness of the floor slab under the rows (`balconySlabThickness`). */
  slabThickness: number;
  /** Height of the front wall above the first row's floor (`balconyParapetHeight`). */
  parapetHeight: number;
}

/** The library's balcony sizes (`DEFAULT_CONSTRAINTS`). */
export const DEFAULT_BALCONY: BalconyDimensions = {
  slabThickness: DEFAULT_CONSTRAINTS.balconySlabThickness,
  parapetHeight: DEFAULT_CONSTRAINTS.balconyParapetHeight,
};

/**
 * The balcony sizes of a hall: `layout.balconySlabThickness` and `layout.balconyParapetHeight`
 * (resolved from the hall's constraints by `buildHallLayout`), each falling back to
 * `DEFAULT_BALCONY` when it is missing (a hand-built layout) or not a finite number.
 * @param layout Built hall layout.
 * @returns Slab and parapet sizes.
 */
export function balconyDimensions(layout: HallLayout): BalconyDimensions {
  // Hand-built layouts, or ones built by an older core, may lack the sizes: fall back to defaults.
  const metres = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return {
    slabThickness: metres(layout.balconySlabThickness, DEFAULT_BALCONY.slabThickness),
    parapetHeight: metres(layout.balconyParapetHeight, DEFAULT_BALCONY.parapetHeight),
  };
}

/** One box of a balcony, in hall metres. */
export interface BalconyPart {
  /**
   * `step`: the floor slab under one row (its top is the row's floor); `riser`: the face between
   * two rows; `parapet`: the front wall; `support`: a column under the front edge, at a side wall.
   */
  kind: 'step' | 'riser' | 'parapet' | 'support';
  bandId: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** Thickness of a riser face, metres. */
const RISER_THICKNESS = 0.04;
/** Thickness of the parapet, metres: the one the validation's sightline check uses. */
const PARAPET_THICKNESS = BALCONY_PARAPET_THICKNESS;
/** Side of a support column, metres. */
const SUPPORT_SIZE = 0.3;

/**
 * The boxes of every balcony of a layout. The floor slab is core's `balconySlabSteps` (the same
 * steps the clearance check measures): each band with `level > 0` gets a step of `slabThickness`
 * under every row of every section, from its front edge (`minZ`) to the next balcony band behind it
 * or the back wall, the strips of neighbouring sections meeting halfway between them and together
 * spanning the hall's width. A riser face closes each step that rises to the next; a front wall
 * `parapetHeight` above the band's lowest front row; and a column under each end of its front edge.
 * The rows of the floor below stay free under it. A layout without upper levels has no parts.
 * @param layout Built hall layout.
 * @param dims Slab and parapet sizes (default: the layout's, see `balconyDimensions`).
 * @returns The boxes, band by band.
 */
export function balconyParts(
  layout: HallLayout,
  dims: BalconyDimensions = balconyDimensions(layout),
): BalconyPart[] {
  const steps = balconySlabSteps(layout);
  if (steps.length === 0) return [];
  const half = layout.hall.width / 2;
  // The slab validation measured: no minimum, so the underside stays where the clearance check put
  // it. A zero-thickness slab is a flat floor (see `buildBalconies`).
  const slab = Math.max(0, dims.slabThickness);
  const parts: BalconyPart[] = [];
  // Steps of one band, in core's order: section by section, front to back within a section.
  const byBand = new Map<string, BalconySlabStep[]>();
  for (const step of steps) {
    const list = byBand.get(step.bandId);
    if (list) list.push(step);
    else byBand.set(step.bandId, [step]);
  }
  for (const band of layout.bands ?? []) {
    const bandSteps = byBand.get(band.id);
    if (!bandSteps || bandSteps.length === 0) continue;
    bandSteps.forEach((step, i) => {
      const span = { minX: step.minX, maxX: step.maxX };
      parts.push({
        kind: 'step',
        bandId: band.id,
        ...span,
        minY: step.floor - slab,
        maxY: step.floor,
        minZ: step.minZ,
        maxZ: step.maxZ,
      });
      // The next step of the same strip (same section) directly behind this one.
      const next = bandSteps[i + 1];
      const sameStrip =
        next !== undefined &&
        Math.abs(next.minX - step.minX) < 1e-9 &&
        Math.abs(next.maxX - step.maxX) < 1e-9 &&
        Math.abs(next.minZ - step.maxZ) < 1e-9;
      if (sameStrip && next.floor > step.floor + 1e-6) {
        parts.push({
          kind: 'riser',
          bandId: band.id,
          ...span,
          minY: step.floor - slab,
          maxY: next.floor,
          minZ: step.maxZ - RISER_THICKNESS / 2,
          maxZ: step.maxZ + RISER_THICKNESS / 2,
        });
      }
    });
    const front = bandSteps.filter((step) => Math.abs(step.minZ - band.minZ) < 1e-9);
    const floor = Math.min(...(front.length > 0 ? front : bandSteps).map((step) => step.floor));
    parts.push({
      kind: 'parapet',
      bandId: band.id,
      minX: -half,
      maxX: half,
      minY: floor - slab,
      maxY: floor + Math.max(0, dims.parapetHeight),
      minZ: band.minZ - PARAPET_THICKNESS,
      maxZ: band.minZ,
    });
    const underside = floor - slab;
    if (underside > 0.05) {
      for (const side of [-1, 1] as const) {
        const outer = side * half;
        parts.push({
          kind: 'support',
          bandId: band.id,
          minX: Math.min(outer, outer - side * SUPPORT_SIZE),
          maxX: Math.max(outer, outer - side * SUPPORT_SIZE),
          minY: 0,
          maxY: underside,
          minZ: band.minZ - PARAPET_THICKNESS,
          maxZ: band.minZ - PARAPET_THICKNESS + SUPPORT_SIZE,
        });
      }
    }
  }
  return parts;
}

/**
 * The balconies as two merged geometries (see `balconyParts`): `floor` holds the stepped slabs
 * and risers, `walls` the front walls and the columns, so each takes one draw call.
 * @param layout Built hall layout.
 * @param dims Slab and parapet sizes (default: the layout's, see `balconyDimensions`).
 * @returns The geometries, null where there is nothing to draw.
 */
export function buildBalconies(
  layout: HallLayout,
  dims: BalconyDimensions = balconyDimensions(layout),
): { floor: BufferGeometry | null; walls: BufferGeometry | null } {
  const box = (part: BalconyPart) => {
    // A flat part (a zero-thickness slab) gets a hairline height above its bottom, never below it:
    // the underside stays at the height validation measured.
    const height = Math.max(0.001, part.maxY - part.minY);
    return new BoxGeometry(
      Math.max(0.001, part.maxX - part.minX),
      height,
      Math.max(0.001, part.maxZ - part.minZ),
    ).translate((part.minX + part.maxX) / 2, part.minY + height / 2, (part.minZ + part.maxZ) / 2);
  };
  const parts = balconyParts(layout, dims);
  return {
    floor: mergeParts(parts.filter((p) => p.kind === 'step' || p.kind === 'riser').map(box)),
    walls: mergeParts(parts.filter((p) => p.kind === 'parapet' || p.kind === 'support').map(box)),
  };
}

/** Two curtain panels on the side walls, from the screen (z = 0) towards the back. */
export function buildCurtains(width: number, height: number): BufferGeometry | null {
  const length = 2.6;
  const panelHeight = height * 0.94;
  const panels: BufferGeometry[] = [];
  for (const side of [-1, 1] as const) {
    const panel = new PlaneGeometry(length, panelHeight, 48, 1);
    const position = panel.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const u = position.getX(i) / length + 0.5;
      position.setZ(i, 0.09 * Math.sin(u * Math.PI * 2 * 7) * (0.6 + 0.4 * (1 - u)));
    }
    panel.computeVertexNormals();
    // The panel faces the room centre; `side` picks the wall.
    panel.rotateY(side === -1 ? Math.PI / 2 : -Math.PI / 2);
    panel.translate(side === -1 ? -width / 2 + 0.1 : width / 2 - 0.1, panelHeight / 2, length / 2);
    panels.push(panel);
  }
  return mergeParts(panels);
}

/** Small emissive dots on the ceiling (instanced positions are added by the caller). */
export function buildCeilingDot(): BufferGeometry {
  return new CircleGeometry(0.07, 12).rotateX(Math.PI / 2);
}

/**
 * The screen in its own coordinates: the bottom edge at `centreY - height/2`, centred on X. With a
 * sagitta the edges move towards the audience (see `curvedScreenZ`).
 */
export function buildScreenGeometry(
  width: number,
  height: number,
  sagitta: number,
  centreY: number,
): BufferGeometry {
  const geometry = new PlaneGeometry(width, height, 64, 16);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    position.setZ(i, curvedScreenZ(position.getX(i), width, sagitta));
  }
  geometry.translate(0, centreY, 0);
  geometry.computeVertexNormals();
  return geometry;
}
