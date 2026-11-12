import type { BandConfig, HallConfig } from '@cinema-hall/core';
import {
  applyPatch,
  findBand,
  firstThatFits,
  type FitOptions,
  moveItem,
  numberedId,
  replaceBands,
  structureIds,
  uniqueId,
} from './config.js';

/**
 * A new band with one section. It copies the previous band's defaults and takes as many rows (3, 2
 * or 1) as still fit the hall; the ids are numbered ("band-3") and shown as "Band 3".
 * @param config Current hall.
 * @param opts `after` names the band to insert after.
 * @param opts.after Id of the band to insert after.
 * @param fit The editor's constraint overrides, used to choose the row count.
 * @returns The candidate config.
 */
export function addBand(
  config: HallConfig,
  opts: { after?: string } = {},
  fit: FitOptions = {},
): unknown {
  const taken = structureIds(config);
  const id = numberedId('band', config.layout.bands.length + 1, taken);
  taken.add(id);
  const sectionCount = config.layout.bands.reduce((sum, item) => sum + item.sections.length, 0);
  const sectionId = numberedId('section', sectionCount + 1, taken);
  const previous = config.layout.bands[config.layout.bands.length - 1];
  const bands = [...config.layout.bands];
  const index = opts.after === undefined ? bands.length : findBand(config, opts.after).index + 1;
  const build = (rows: number): unknown => {
    const band: BandConfig = {
      id,
      defaults: {
        rowSpacing: 0.95,
        seatPitch: 0.6,
        seatType: Object.keys(config.seatTypes)[0],
        ...structuredClone(previous?.defaults),
        rows,
      },
      sections: [{ id: sectionId, seatsPerRow: 4 }],
    };
    const next = [...bands];
    next.splice(index, 0, band);
    return replaceBands(config, next);
  };
  return build(firstThatFits(config, [3, 2, 1], build, fit));
}

/**
 * Removes a band.
 * @param config Current hall.
 * @param id Band id.
 * @returns The candidate config.
 */
export function removeBand(config: HallConfig, id: string): unknown {
  const { index } = findBand(config, id);
  return replaceBands(
    config,
    config.layout.bands.filter((_, position) => position !== index),
  );
}

/**
 * Moves a band to a position.
 * @param config Current hall.
 * @param id Band id.
 * @param toIndex New index.
 * @returns The candidate config.
 */
export function moveBand(config: HallConfig, id: string, toIndex: number): unknown {
  const { index } = findBand(config, id);
  return replaceBands(config, moveItem(config.layout.bands, index, toIndex));
}

/**
 * Copies a band and all its sections under fresh ids, placed right after the original.
 * @param config Current hall.
 * @param id Band id.
 * @returns The candidate config.
 */
export function duplicateBand(config: HallConfig, id: string): unknown {
  const { index, band } = findBand(config, id);
  const taken = structureIds(config);
  const copyId = uniqueId(`${id}-copy`, taken);
  taken.add(copyId);
  const sections = band.sections.map((section) => {
    const sectionId = uniqueId(`${section.id}-copy`, taken);
    taken.add(sectionId);
    return { ...structuredClone(section), id: sectionId };
  });
  const copy = { ...structuredClone(band), id: copyId, sections };
  const bands = [...config.layout.bands];
  bands.splice(index + 1, 0, copy);
  return replaceBands(config, bands);
}

/**
 * Deep-merges a patch into a band.
 * @param config Current hall.
 * @param id Band id.
 * @param patch Partial band.
 * @returns The candidate config.
 */
export function patchBand(config: HallConfig, id: string, patch: unknown): unknown {
  const { index, band } = findBand(config, id);
  return replaceBands(
    config,
    config.layout.bands.map((item, position) =>
      position === index ? applyPatch(band, patch) : item,
    ),
  );
}
