import type { Constraints } from '@cinema-hall/core';
import { editorLabel, type EditorLabels } from '../../labels/editor-labels.js';
import { formatLabel } from '../../labels/labels.js';

/** Sides a section id can end with: `lounge-left` is the left section of the band `lounge`. */
const SIDE_NAMES: Record<string, keyof EditorLabels> = {
  left: 'leftName',
  centre: 'centreName',
  center: 'centreName',
  right: 'rightName',
};

/**
 * A display name made from an id, the way core names objects in issue texts: dashes and
 * underscores become spaces and the first letter is capitalised (`vip-block` → `Vip block`).
 * @param id Band or section id.
 * @returns The name, or the id itself when it has no letters to show.
 */
export function idDisplayName(id: string): string {
  const text = id.replace(/[-_]+/g, ' ').trim();
  return text.length === 0 ? id : text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Friendly names for the ids of the built-in halls and templates (`centre`, `balcony`, `stalls`…)
 * in the editor language. A section named after its band and a side (`lounge-left` in the band
 * `lounge`) is called by its side. Any other id is shown as a name made from it (`Vip block`), never
 * as a raw lowercase id.
 * @param id Object id or built-in label.
 * @param labels Resolved constructor labels.
 * @param bandId The band of a section id.
 * @returns A translated built-in name, or a name made from the host id.
 */
export function objectName(id: string, labels: EditorLabels, bandId?: string): string {
  const names: Record<string, keyof EditorLabels> = {
    centre: 'centreName',
    left: 'leftName',
    right: 'rightName',
    main: 'mainName',
    recliners: 'reclinerName',
    standard: 'standardName',
    recliner: 'reclinerName',
    'rec-left': 'leftName',
    'rec-centre': 'centreName',
    'rec-right': 'rightName',
    balcony: 'balconyName',
    stalls: 'stallsName',
    lounge: 'loungeName',
  };
  const key = Object.hasOwn(names, id) ? names[id] : undefined;
  if (key) return formatLabel(editorLabel(labels, key));
  const generated = generatedName(id, labels, bandId);
  if (generated !== null) return generated;
  if (bandId !== undefined && id.startsWith(`${bandId}-`)) {
    const side = id.slice(bandId.length + 1);
    const sideKey = Object.hasOwn(SIDE_NAMES, side) ? SIDE_NAMES[side] : undefined;
    if (sideKey) return formatLabel(editorLabel(labels, sideKey));
  }
  return idDisplayName(id);
}

/**
 * The display name of an id the editor generated (`band-3`, `section-4`, or a section numbered in
 * its band, `main-section-2`), so the plan and the inspector never show a raw English placeholder. A
 * name the user chose is not generated.
 * @param id Band or section id.
 * @param labels Resolved constructor labels.
 * @param bandId The band of a section id: its `<band id>-section-N` ids are generated too.
 * @returns "Band 3" / "Section 4" in the editor language, or null for any other id.
 */
export function generatedName(id: string, labels: EditorLabels, bandId?: string): string | null {
  const band = /^band(?:-(\d+))?$/.exec(id);
  if (band) return formatLabel(labels.generatedBand, { n: band[1] ?? '' }).trim();
  const local =
    bandId !== undefined && id.startsWith(`${bandId}-`) ? id.slice(bandId.length + 1) : id;
  const section = /^section(?:-(\d+))?$/.exec(local);
  if (section) return formatLabel(labels.generatedSection, { n: section[1] ?? '' }).trim();
  return null;
}

/** The label key of each check limit, for the limit fields and for messages that name them. */
export const CONSTRAINT_LABELS: Readonly<Record<keyof Constraints, keyof EditorLabels>> = {
  minAisleWidth: 'cMinAisleWidth',
  minWallClearance: 'cMinWallClearance',
  minRearClearance: 'cMinRearClearance',
  minLegroom: 'cMinLegroom',
  minHeadroom: 'cMinHeadroom',
  minFirstRowDistanceRatio: 'cFirstRowRatio',
  maxFrontRowVerticalAngle: 'cMaxFrontAngle',
  headAboveEye: 'cHeadAboveEye',
  minOverhangClearance: 'cMinOverhangClearance',
  balconySlabThickness: 'cBalconySlabThickness',
  balconyParapetHeight: 'cBalconyParapetHeight',
};
