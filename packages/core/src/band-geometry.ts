import type { BandBox, HallLayout } from './layout.js';
import type { BandConfig } from './schema.js';

/** Float tolerance for plan overlaps, in metres. */
export const PLAN_EPS = 1e-9;

/**
 * For every band, the index of the band that starts its run: the first band, or the nearest band
 * at or before it with `startDistance`. Bands of one run follow each other from the screen to the
 * back, so they never overlap in plan; only bands of different runs can (a balcony and the stalls
 * under it). A config without `startDistance` is a single run.
 */
export function bandRuns(bands: readonly Pick<BandConfig, 'startDistance'>[]): number[] {
  const runs: number[] = [];
  bands.forEach((band, index) => {
    runs.push(index === 0 || band.startDistance !== undefined ? index : runs[index - 1]!);
  });
  return runs;
}

/**
 * True when two depth ranges overlap by more than a rounding error. Every band is centred on the
 * screen axis, so two bands always overlap across the hall's width and only depth decides.
 */
export function footprintsOverlap(
  a: { minZ: number; maxZ: number },
  b: { minZ: number; maxZ: number },
): boolean {
  return Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > PLAN_EPS;
}

/**
 * One step of a balcony's floor slab: a box across the hall, in metres, whose top is the floor of
 * one row of the balcony. Its underside is `floor - balconySlabThickness`.
 */
export interface BalconySlabStep {
  /** Id of the balcony band. */
  bandId: string;
  /** Level of the band (1 and up). */
  level: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Floor height of the row the step carries (the top of the slab). */
  floor: number;
}

/** Extent and row floors of one section of a balcony. */
interface SlabSection {
  minX: number;
  maxX: number;
  rows: { z: number; floor: number }[];
}

/**
 * The sections of a band, left to right, each with the depth and floor of its own rows. They come
 * from the section footprints (`layout.sections`) and the row floors (`layout.rows`), not from the
 * seats, so a row or a section whose seats are all excluded keeps its part of the slab.
 */
function slabSections(layout: HallLayout, bandId: string): SlabSection[] {
  const list: SlabSection[] = [];
  for (const box of layout.sections) {
    if (box.bandId !== bandId) continue;
    const rows: SlabSection['rows'] = [];
    let floor = box.floorElevation ?? layout.rows[box.firstRowIndex]?.elevation ?? 0;
    for (let r = 0; r < box.rows; r++) {
      const row = layout.rows[box.firstRowIndex + r];
      // A hand-built layout may lack a row; it then keeps the floor of the row in front.
      if (row !== undefined && row.bandId === bandId) floor = row.elevation;
      rows.push({ z: box.minZ + box.rowSpacing / 2 + r * box.rowSpacing, floor });
    }
    if (rows.length > 0) list.push({ minX: box.minX, maxX: box.maxX, rows });
  }
  return list.sort((a, b) => a.minX - b.minX);
}

/**
 * The floor slab of every balcony (every band with `level` 1 and up), as the 3D view draws it and
 * the clearance check measures it. The slab spans the full width of the hall and runs from the
 * band's front edge (`minZ`) back to the next balcony band of the same level, or to the back wall.
 * Each section gets its own steps at the depth of its own rows (from the section footprints and row
 * floors, so a row or section whose seats are all excluded keeps its step); the strips of
 * neighbouring sections meet halfway between their footprints and the outer ones reach the side
 * walls. Renderers draw exactly these steps. A layout without `bands` (a
 * single-level layout built by hand) has no slab.
 *
 * @param layout The hall layout.
 * @returns The steps, band by band, front to back within a section.
 */
export function balconySlabSteps(layout: HallLayout): BalconySlabStep[] {
  const bands: BandBox[] = (layout.bands ?? []).filter((band) => band.level > 0);
  if (bands.length === 0) return [];
  const half = layout.hall.width / 2;
  const steps: BalconySlabStep[] = [];
  for (const band of bands) {
    const behind = bands
      .filter(
        (other) => other !== band && other.level === band.level && other.minZ > band.minZ + 1e-6,
      )
      .map((other) => other.minZ);
    const end = Math.max(band.maxZ, Math.min(layout.hall.depth, ...behind));
    const sections = slabSections(layout, band.id);
    sections.forEach((section, s) => {
      const previous = sections[s - 1];
      const after = sections[s + 1];
      const minX = previous ? (previous.maxX + section.minX) / 2 : -half;
      const maxX = after ? (section.maxX + after.minX) / 2 : half;
      section.rows.forEach((row, i) => {
        const next = section.rows[i + 1];
        steps.push({
          bandId: band.id,
          level: band.level,
          minX,
          maxX,
          minZ: i === 0 ? band.minZ : (section.rows[i - 1]!.z + row.z) / 2,
          maxZ: next ? (row.z + next.z) / 2 : end,
          floor: row.floor,
        });
      });
    });
  }
  return steps;
}
