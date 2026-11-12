import type { Constraints } from '@cinema-hall/core';
import type { EditorLabels } from '../../labels/editor-labels.js';
import { formatLabel } from '../../labels/labels.js';

/**
 * Friendly names for the built-in hall; host ids keep their own spelling.
 * @param id Object id or built-in label.
 * @param labels Resolved constructor labels.
 * @returns A translated built-in name or the unchanged host id.
 */
export function objectName(id: string, labels: EditorLabels): string {
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
  };
  const key = Object.hasOwn(names, id) ? names[id] : undefined;
  return key ? formatLabel(labels[key]) : (generatedName(id, labels) ?? id);
}

/**
 * The display name of an id the editor generated (`band-3`, `section-4`), so the plan and the
 * inspector never show a raw English placeholder. A name the user chose is not generated.
 * @param id Band or section id.
 * @param labels Resolved constructor labels.
 * @returns "Band 3" / "Section 4" in the editor language, or null for any other id.
 */
export function generatedName(id: string, labels: EditorLabels): string | null {
  const band = /^band(?:-(\d+))?$/.exec(id);
  if (band) return formatLabel(labels.generatedBand, { n: band[1] ?? '' }).trim();
  const section = /^section(?:-(\d+))?$/.exec(id);
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
};
