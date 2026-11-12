import type { BandConfig, HallConfig, SectionConfig } from '@cinema-hall/core';
import {
  applyPatch,
  findBand,
  moveItem,
  notFound,
  replaceBands,
  structureIds,
  firstThatFits,
  type FitOptions,
  numberedId,
  uniqueId,
} from './config.js';
import type { SectionRef } from './types.js';

interface Located {
  bandIndex: number;
  band: BandConfig;
  sectionIndex: number;
  section: SectionConfig;
}

function locate(config: HallConfig, ref: SectionRef): Located {
  const { index: bandIndex, band } = findBand(config, ref.bandId);
  const sectionIndex = band.sections.findIndex((section) => section.id === ref.sectionId);
  const section = band.sections[sectionIndex];
  if (sectionIndex < 0 || section === undefined) {
    throw notFound('section', ref.sectionId, ['layout', 'bands', bandIndex, 'sections']);
  }
  return { bandIndex, band, sectionIndex, section };
}

function withSections(
  config: HallConfig,
  bandIndex: number,
  sections: readonly unknown[],
): unknown {
  return replaceBands(
    config,
    config.layout.bands.map((band, position) =>
      position === bandIndex ? { ...band, sections } : band,
    ),
  );
}

function sectionIndexIn(band: BandConfig, id: string): number {
  const index = band.sections.findIndex((section) => section.id === id);
  if (index < 0) throw notFound('section', id, ['layout', 'bands']);
  return index;
}

/**
 * Adds a section to a band. It inherits geometry from the band defaults; where the band has none, from
 * the neighbouring section's own values. It takes as many seats as still fit the hall.
 * @param config Current hall.
 * @param bandId Band to add to.
 * @param opts `after` and explicit section fields.
 * @param fit The editor's constraint overrides, used to choose the seat count.
 * @returns The candidate config.
 */
export function addSection(
  config: HallConfig,
  bandId: string,
  opts: { after?: string } & Partial<SectionConfig>,
  fit: FitOptions = {},
): unknown {
  const { after, ...fields } = opts;
  const { index, band } = findBand(config, bandId);
  const count = config.layout.bands.reduce((sum, item) => sum + item.sections.length, 0);
  const id = fields.id ?? numberedId('section', count + 1, structureIds(config));
  const at = after === undefined ? band.sections.length : sectionIndexIn(band, after) + 1;
  const sibling = band.sections[at - 1] ?? band.sections[0];
  const inherited: Partial<SectionConfig> = {};
  for (const key of ['rows', 'rowSpacing', 'seatPitch', 'seatType'] as const) {
    const own = sibling?.[key];
    if (band.defaults?.[key] === undefined && own !== undefined)
      Object.assign(inherited, { [key]: own });
  }
  const build = (seatsPerRow: number): unknown => {
    const sections = [...band.sections];
    sections.splice(at, 0, { ...inherited, ...fields, seatsPerRow, id });
    return withSections(config, index, sections);
  };
  // Without an explicit size the new section takes as many seats (4 down to 1) as still fit the hall.
  const seats = fields.seatsPerRow ?? firstThatFits(config, [4, 3, 2, 1], build, fit);
  return build(seats);
}

/**
 * Removes a section.
 * @param config Current hall.
 * @param ref Section reference.
 * @returns The candidate config.
 */
export function removeSection(config: HallConfig, ref: SectionRef): unknown {
  const { bandIndex, band, sectionIndex } = locate(config, ref);
  return withSections(
    config,
    bandIndex,
    band.sections.filter((_, position) => position !== sectionIndex),
  );
}

/**
 * Moves a section inside its band.
 * @param config Current hall.
 * @param ref Section reference.
 * @param toIndex New index.
 * @returns The candidate config.
 */
export function moveSection(config: HallConfig, ref: SectionRef, toIndex: number): unknown {
  const { bandIndex, band, sectionIndex } = locate(config, ref);
  return withSections(config, bandIndex, moveItem(band.sections, sectionIndex, toIndex));
}

/**
 * Copies a section under a fresh id, placed right after the original.
 * @param config Current hall.
 * @param ref Section reference.
 * @returns The candidate config.
 */
export function duplicateSection(config: HallConfig, ref: SectionRef): unknown {
  const { bandIndex, band, sectionIndex, section } = locate(config, ref);
  const id = uniqueId(`${section.id}-copy`, structureIds(config));
  const sections = [...band.sections];
  sections.splice(sectionIndex + 1, 0, { ...structuredClone(section), id });
  return withSections(config, bandIndex, sections);
}

/**
 * Deep-merges a patch into a section.
 * @param config Current hall.
 * @param ref Section reference.
 * @param patch Partial section.
 * @returns The candidate config.
 */
export function patchSection(config: HallConfig, ref: SectionRef, patch: unknown): unknown {
  const { bandIndex, band, sectionIndex, section } = locate(config, ref);
  const sections = band.sections.map((item, position) =>
    position === sectionIndex ? applyPatch(section, patch) : item,
  );
  return withSections(config, bandIndex, sections);
}
