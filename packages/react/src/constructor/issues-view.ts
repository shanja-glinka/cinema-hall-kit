import { formatIssue, type HallConfig, type Issue, type IssueRef } from '@cinema-hall/core';
import type { EditorLabels } from '../labels/editor-labels.js';
import { formatLabel } from '../labels/labels.js';
import { CONSTRAINT_LABELS } from './ui/names.js';

/**
 * Human text of an issue; editor rejections use the constructor labels.
 * @param issue Issue to describe.
 * @param labels Resolved constructor labels.
 * @param locale Host locale.
 * @returns Human-readable issue text.
 */
export function describeIssue(
  issue: Issue,
  labels: EditorLabels,
  locale: string | undefined,
): string {
  if (issue.code === 'editor.notFound') {
    return formatLabel(labels.notFound, { id: issue.params?.id ?? '' });
  }
  if (issue.code === 'fit.depth') {
    return formatLabel(labels.issueFitDepth, {
      required: formatNumber(issue.params?.required, locale),
      available: formatNumber(issue.params?.available, locale),
    });
  }
  const last = issue.path[issue.path.length - 1];
  if (issue.code === 'schema.tooSmall' && last === 'bands')
    return formatLabel(labels.issueMinBands);
  if (issue.code === 'schema.tooSmall' && last === 'sections')
    return formatLabel(labels.issueMinSections);
  const text = formatIssue(issue, undefined, locale);
  const field = FIELD_ISSUES.includes(issue.code) ? fieldLabel(issue.path, labels) : null;
  if (field === null) return text;
  return formatLabel(labels.issueField, {
    field,
    message: text.charAt(0).toLowerCase() + text.slice(1),
  });
}

const FIELD_ISSUES: readonly string[] = [
  'schema.tooSmall',
  'schema.tooBig',
  'schema.invalidType',
  'schema.invalidValue',
  'schema.required',
  'schema.invalidFormat',
];

function formatNumber(value: unknown, locale: string | undefined): string {
  if (typeof value !== 'number') return String(value ?? '');
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

const STRUCTURE_FIELDS: Readonly<Record<string, keyof EditorLabels>> = {
  rows: 'sectionRows',
  seatsPerRow: 'sectionSeats',
  rowSpacing: 'sectionRowSpacing',
  seatPitch: 'sectionSeatPitch',
  seatType: 'sectionSeatType',
  priceTier: 'sectionPriceTier',
  color: 'sectionColor',
};

const FIELDS: Readonly<Record<string, keyof EditorLabels>> = {
  name: 'name',
  'hall.width': 'hallWidth',
  'hall.depth': 'hallDepth',
  'hall.height': 'hallHeight',
  'hall.wallColor': 'wallColor',
  'hall.floorColor': 'floorColor',
  'screen.width': 'screenWidth',
  'screen.height': 'screenHeight',
  'screen.elevation': 'screenElevation',
  'screen.curvature': 'screenCurvature',
  'layout.firstRowDistance': 'firstRowDistance',
  'layout.eyeHeight': 'eyeHeight',
  'layout.rowLabels': 'rowLabels',
  'layout.seatNumbering': 'seatNumbering',
  'layout.bands.*.id': 'sectionId',
  'layout.bands.*.sections.*.id': 'sectionId',
  'layout.bands.*.gapBefore': 'bandGapBefore',
  'layout.bands.*.riserHeight': 'bandRiser',
  'layout.bands.*.sections.*.gapBefore': 'sectionGap',
  'seatTypes.*.label': 'seatTypeLabel',
  'seatTypes.*.color': 'seatTypeColor',
  'seatTypes.*.width': 'seatTypeWidth',
  'seatTypes.*.depth': 'seatTypeDepth',
  'pricing.tiers.*': 'seatPrice',
  'viewingZones.*.label': 'zoneLabel',
  'viewingZones.*.minFov': 'zoneMinFov',
};

/**
 * The plain-language name of the field at a config path, for messages that would otherwise not say
 * which field they are about. It covers every field the constructor can edit: the hall, screen, layout,
 * bands, sections, seat types, prices, check limits and viewing zones.
 * @param path Config path of the issue.
 * @param labels Resolved constructor labels.
 * @returns The field label, or null when the path is not a known field.
 */
export function fieldLabel(
  path: readonly (string | number)[],
  labels: EditorLabels,
): string | null {
  const generic = path.map((part, index) =>
    typeof part === 'number' ||
    (index === 1 && path[0] === 'seatTypes') ||
    (index === 2 && path[0] === 'pricing' && path[1] === 'tiers')
      ? '*'
      : part,
  );
  const key = generic.join('.');
  // Own properties only: a path such as `constructor` or `toString` is runtime data and must fall
  // back to "unknown field", not resolve to an inherited member.
  const own = <T>(table: Readonly<Record<string, T>>, id: string): T | undefined =>
    Object.hasOwn(table, id) ? table[id] : undefined;
  let name: keyof EditorLabels | undefined = own(FIELDS, key);
  if (name === undefined && generic[0] === 'constraints' && generic.length === 2) {
    name = own<keyof EditorLabels>(CONSTRAINT_LABELS, String(generic[1]));
  }
  if (name === undefined && generic[0] === 'layout' && generic[1] === 'bands') {
    // Section fields and band defaults share their labels: `sections.*.rows`, `defaults.rows`.
    const tail = generic[generic.length - 1];
    const parent = generic[generic.length - 2];
    if (typeof tail === 'string' && (parent === 'defaults' || generic[3] === 'sections')) {
      name = own(STRUCTURE_FIELDS, tail);
    }
  }
  const text = name === undefined ? undefined : labels[name];
  return text === undefined ? null : formatLabel(text);
}

/**
 * Groups validation issues by severity.
 * @param issues Issues to group.
 * @returns Error and warning lists.
 */
export function groupIssues(issues: readonly Issue[]): { errors: Issue[]; warnings: Issue[] } {
  return {
    errors: issues.filter((issue) => issue.severity === 'error'),
    warnings: issues.filter((issue) => issue.severity === 'warning'),
  };
}

interface BandLike {
  readonly id: string;
  readonly sections: readonly { readonly id: string }[];
}

/**
 * Section ids to highlight; a band error covers all its sections.
 * @param issues Client and server issues.
 * @param bands Current bands and stable section ids.
 * @returns Unique affected section ids.
 */
export function sectionIdsWithErrors(
  issues: readonly Issue[],
  bands: readonly BandLike[],
): string[] {
  const ids = new Set<string>();
  for (const issue of issues) {
    if (issue.severity !== 'error') continue;
    const ref: IssueRef | undefined = issue.ref;
    if (ref?.sectionId !== undefined) {
      ids.add(ref.sectionId);
    } else {
      const band =
        ref?.bandId !== undefined
          ? bands.find((item) => item.id === ref.bandId)
          : issue.path[0] === 'layout' &&
              issue.path[1] === 'bands' &&
              typeof issue.path[2] === 'number'
            ? bands[issue.path[2]]
            : undefined;
      if (!band) continue;
      const index =
        issue.path[3] === 'sections' && typeof issue.path[4] === 'number'
          ? issue.path[4]
          : undefined;
      const section = index === undefined ? undefined : band.sections[index];
      if (section) ids.add(section.id);
      else for (const item of band.sections) ids.add(item.id);
    }
  }
  return [...ids];
}

/**
 * Maps a broad width error to the widest section so its seat count can be corrected.
 * @param issue Issue from client or server validation.
 * @param config Current valid hall.
 * @returns Corrective field path and stable reference, or the original target.
 */
export function issueFocusTarget(
  issue: Issue,
  config: HallConfig,
): { path: readonly (string | number)[]; ref?: IssueRef } {
  if (issue.code === 'fit.width' && issue.path[0] === 'layout' && issue.path.length === 3) {
    const bandIndex = config.layout.bands.findIndex((band, index) =>
      issue.ref?.bandId ? band.id === issue.ref.bandId : index === issue.path[2],
    );
    const band = config.layout.bands[bandIndex];
    if (band) {
      let sectionIndex = 0;
      band.sections.forEach((section, index) => {
        const widest = band.sections[sectionIndex];
        if (
          widest &&
          section.seatsPerRow * (section.seatPitch ?? band.defaults?.seatPitch ?? 0.6) >
            widest.seatsPerRow * (widest.seatPitch ?? band.defaults?.seatPitch ?? 0.6)
        )
          sectionIndex = index;
      });
      const section = band.sections[sectionIndex];
      if (section)
        return {
          path: ['layout', 'bands', bandIndex, 'sections', sectionIndex, 'seatsPerRow'],
          ref: { bandId: band.id, sectionId: section.id },
        };
    }
  }
  if (issue.code === 'fit.depth') {
    // The rearmost band is the one that goes past the back wall: the badge and the notice go there.
    const last = config.layout.bands[config.layout.bands.length - 1];
    if (last)
      return {
        path: ['layout', 'bands', config.layout.bands.length - 1],
        ref: { bandId: last.id },
      };
  }
  return { path: issue.path, ref: issue.ref };
}
