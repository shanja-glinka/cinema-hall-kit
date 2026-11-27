import {
  formatIssue,
  issueMessages,
  LIMITS,
  parseHallConfig,
  validateHall,
  type Constraints,
  type HallConfig,
  type Issue,
  type IssueMessages,
  type IssueRef,
} from '@cinema-hall/core';
import { editorLabelsEn, type EditorLabels } from '../labels/editor-labels.js';
import { formatLabel } from '../labels/labels.js';
import { CONSTRAINT_LABELS, generatedName, objectName } from './ui/names.js';
import { selectionForIssue } from './selection.js';
import { editorLabel } from '../labels/editor-labels.js';

/**
 * Human text of an issue; editor rejections use the constructor labels.
 * @param issue Issue to describe.
 * @param labels Resolved constructor labels.
 * @param locale Host locale: numbers in the text are written in it (`16,25` for `de-DE`).
 * @param messages Issue text catalog (`Labels.issues`, for example `issueMessages.en`); codes it
 *   does not cover, and every code when it is absent, use the built-in English texts. For
 *   `fit.depth`, a catalog text of its own wins; otherwise a host's `labels.editor.issueFitDepth`
 *   (the older way to word it) is kept, then the built-in text.
 * @returns Human-readable issue text.
 */
export function describeIssue(
  issue: Issue,
  labels: EditorLabels,
  locale: string | undefined,
  messages?: IssueMessages,
): string {
  if (issue.code === 'editor.notFound') {
    return formatLabel(labels.notFound, { id: issue.params?.id ?? '' });
  }
  if (issue.code === 'fit.depth') {
    const legacy = legacyFitDepth(labels, messages);
    if (legacy !== undefined)
      return formatLabel(legacy, {
        required: formatNumber(issue.params?.required, locale),
        available: formatNumber(issue.params?.available, locale),
      });
  }
  const last = issue.path[issue.path.length - 1];
  if (issue.code === 'schema.tooSmall' && last === 'bands')
    return formatLabel(labels.issueMinBands);
  if (issue.code === 'schema.tooSmall' && last === 'sections')
    return formatLabel(labels.issueMinSections);
  const text = formatIssue(localizeParams(issue, locale), messages, locale);
  const field = FIELD_ISSUES.includes(issue.code) ? fieldLabel(issue.path, labels) : null;
  if (field === null) return text;
  return formatLabel(labels.issueField, {
    field,
    message: text.charAt(0).toLowerCase() + text.slice(1),
  });
}

/**
 * The host's own `labels.editor.issueFitDepth`, when the depth issue should still read it: the
 * label differs from the built-in one and the issue catalog has no `fit.depth` text of its own (it
 * is absent or keeps the built-in English text).
 */
function legacyFitDepth(
  labels: EditorLabels,
  messages: IssueMessages | undefined,
): EditorLabels['issueFitDepth'] | undefined {
  const custom = labels.issueFitDepth;
  if (custom === undefined || custom === editorLabelsEn.issueFitDepth) return undefined;
  const catalog = messages?.['fit.depth'];
  if (catalog !== undefined && catalog !== issueMessages.en['fit.depth']) return undefined;
  return custom;
}

const FIELD_ISSUES: readonly string[] = [
  'schema.tooSmall',
  'schema.tooBig',
  'schema.invalidType',
  'schema.invalidValue',
  'schema.required',
  'schema.invalidFormat',
];

/**
 * The issue with the decimal point of its number params written as in the locale, so "16.25" reads
 * "16,25" in German and stays "16.25" in English. Digits are not grouped or rounded.
 */
function localizeParams(issue: Issue, locale: string | undefined): Issue {
  const params = issue.params;
  if (!params) return issue;
  let separator: string | undefined;
  let changed = false;
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    const text = typeof value === 'number' ? String(value) : '';
    if (text.includes('.') && !/e/i.test(text)) {
      separator ??=
        new Intl.NumberFormat(locale).formatToParts(1.5).find((part) => part.type === 'decimal')
          ?.value ?? '.';
      out[key] = text.replace('.', separator);
      changed = true;
    } else out[key] = value;
  }
  return changed ? { ...issue, params: out } : issue;
}

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
  'layout.bands.*.label': 'bandLabel',
  'layout.bands.*.startDistance': 'bandStartDistance',
  'layout.bands.*.elevation': 'bandElevation',
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
    // The band of the rearmost seat (named by the issue), else the rearmost band.
    const named = config.layout.bands.findIndex((band) => band.id === issue.ref?.bandId);
    const index = named >= 0 ? named : config.layout.bands.length - 1;
    const band = config.layout.bands[index];
    if (band) return { path: ['layout', 'bands', index], ref: { bandId: band.id } };
  }
  return { path: issue.path, ref: issue.ref };
}

/** A one-click fix of an issue: the hall size that makes the seats fit. */
export interface IssueFix {
  /** The hall dimension to change. */
  readonly dimension: 'depth' | 'width';
  /**
   * The new size in metres, rounded up to 5 cm from the largest size the issue's rounded
   * `required` can stand for, so the fix always clears the error.
   */
  readonly value: number;
}

/** The hall an issue belongs to, to check a fix that had to be capped at the largest hall size. */
export interface IssueFixContext {
  /** The current hall. */
  readonly config: HallConfig;
  /** The constraint overrides the issue was judged with. */
  readonly constraints?: Partial<Constraints>;
}

/**
 * The fix the editor can offer for an issue: a hall that is too shallow or too narrow for its seats
 * can be made as deep or as wide as they need, up to the largest size a hall may have
 * (`LIMITS.maxMetres`).
 * @param issue Issue from client or server validation.
 * @param context The current hall. When the size had to be capped at the largest hall size, the
 *   fix is offered only if that size really clears the issue (checked against this hall); without
 *   it, a capped fix is offered only when the rounded `required` guarantees it clears the issue.
 * @returns The hall size to set, or null when the issue has no one-click fix.
 */
export function issueFix(issue: Issue, context?: IssueFixContext): IssueFix | null {
  if (issue.code !== 'fit.depth' && issue.code !== 'fit.width') return null;
  const required = Number(issue.params?.required);
  if (!Number.isFinite(required) || required <= 0) return null;
  const max = LIMITS.maxMetres;
  // A hall that needs more than the largest size cannot be fixed by resizing it.
  if (required > max) return null;
  const dimension = issue.code === 'fit.depth' ? 'depth' : 'width';
  // Core reports `required` rounded to 1 cm (8.002 m reads 8.00 m): the actual need can be up to
  // half a centimetre more, so round up from there. Rounding the shown value alone could propose
  // the current size, which leaves the error in place.
  const value = Math.ceil((required + 0.005) * 20 - 1e-6) / 20;
  if (value <= max) return { dimension, value };
  // The rounded-up size is above the schema maximum: the largest size may still be enough.
  if (required + 0.005 <= max) return { dimension, value: max };
  if (!context) return null;
  return maxSizeClears(issue, dimension, context) ? { dimension, value: max } : null;
}

/**
 * Whether making the hall as large as allowed clears a fit issue.
 * @param issue A `fit.depth` or `fit.width` issue.
 * @param dimension The hall size it is about.
 * @param context The current hall and constraints.
 * @returns True when the resized hall is valid and no longer has that issue.
 */
function maxSizeClears(
  issue: Issue,
  dimension: 'depth' | 'width',
  context: IssueFixContext,
): boolean {
  const resized: HallConfig = {
    ...context.config,
    hall: { ...context.config.hall, [dimension]: LIMITS.maxMetres },
  };
  const samePath = (path: readonly (string | number)[]): boolean =>
    path.length === issue.path.length && path.every((part, index) => part === issue.path[index]);
  // The resized hall must still be a valid hall, and the issue must be gone from it.
  if (!parseHallConfig(resized).ok) return false;
  return !validateHall(resized, { constraints: context.constraints }).some(
    (item) => item.code === issue.code && samePath(item.path),
  );
}

/**
 * The text of the fix button of an issue.
 * @param fix Fix from `issueFix`.
 * @param labels Resolved constructor labels.
 * @param locale Host locale.
 * @returns "Make the hall 16.25 m deep" in the editor language.
 */
export function issueFixLabel(
  fix: IssueFix,
  labels: EditorLabels,
  locale: string | undefined,
): string {
  return formatLabel(
    fix.dimension === 'depth' ? editorLabel(labels, 'fixDepth') : editorLabel(labels, 'fixWidth'),
    {
      value: formatNumber(fix.value, locale),
    },
  );
}

/**
 * The display name of a band: "Band 2 · Balcony" with its name (or a known id), or "Band 2" for a
 * generated id.
 * @param band The band.
 * @param band.id Band id.
 * @param band.label Display name of the band, when it has one.
 * @param index Its position.
 * @param labels Resolved constructor labels.
 * @returns The band name for messages and lists.
 */
export function bandDisplayName(
  band: { readonly id: string; readonly label?: string },
  index: number,
  labels: EditorLabels,
): string {
  if (band.label !== undefined)
    return formatLabel(labels.bandCanvas, { number: index + 1, name: band.label });
  return generatedName(band.id, labels) === null
    ? formatLabel(labels.bandCanvas, { number: index + 1, name: objectName(band.id, labels) })
    : formatLabel(labels.bandTitle, { id: index + 1 });
}

/**
 * The display name of a section: "Section “Centre”", or "Section 2" for a generated id.
 * @param sectionId Section id.
 * @param bandId Its band id.
 * @param labels Resolved constructor labels.
 * @returns The section name for messages and lists.
 */
export function sectionDisplayName(
  sectionId: string,
  bandId: string,
  labels: EditorLabels,
): string {
  return (
    generatedName(sectionId, labels, bandId) ??
    formatLabel(labels.sectionTitle, { name: objectName(sectionId, labels, bandId) })
  );
}

/**
 * Where an issue is, in words: the band, or the band and the section, it is about. The issue list
 * shows it so that issues with the same text can be told apart.
 * @param issue Issue from client or server validation.
 * @param config Current valid hall.
 * @param labels Resolved constructor labels.
 * @returns "Band 1 · Main hall › Section “Centre”", or null for issues about the hall or screen.
 */
export function issuePlace(issue: Issue, config: HallConfig, labels: EditorLabels): string | null {
  const target = issueFocusTarget(issue, config);
  const owner = selectionForIssue(config, target.path, target.ref);
  if (owner.kind !== 'band' && owner.kind !== 'section') return null;
  const index = config.layout.bands.findIndex((band) => band.id === owner.bandId);
  const band = config.layout.bands[index];
  if (band === undefined) return null;
  const bandName = bandDisplayName(band, index, labels);
  if (owner.kind === 'band') return bandName;
  return formatLabel(editorLabel(labels, 'issuePlace'), {
    band: bandName,
    section: sectionDisplayName(owner.sectionId, band.id, labels),
  });
}
