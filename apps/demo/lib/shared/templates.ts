/**
 * The starting points for a new hall, as the demo names them. The list follows the library's
 * `builtInTemplates`: a template appears only when the installed `@cinema-hall/core` has it (the
 * two-level `balcony` template is newer than the others).
 */
import { builtInTemplates } from '@cinema-hall/core';
import { t } from './texts';

export interface TemplateChoice {
  id: string;
  title: string;
  description: string;
}

/** The templates the demo has its own copy for, in the order they are offered. */
const KNOWN = ['single', 'threeSections', 'stadium', 'balcony'] as const;
type KnownId = (typeof KNOWN)[number];

/**
 * The templates to offer: the known ones that the library has, then any other library template
 * under its own label.
 * @param available Template ids and labels of the library (defaults to `builtInTemplates`).
 * @returns The choices, in display order.
 */
export function templateChoices(
  available: readonly { id: string; label: string }[] = builtInTemplates,
): TemplateChoice[] {
  const texts = t.templates;
  const ids = new Set(available.map((template) => template.id));
  const known = KNOWN.filter((id) => ids.has(id)).map((id: KnownId) => ({ id, ...texts[id] }));
  const knownIds = new Set<string>(KNOWN);
  const others = available
    .filter((template) => !knownIds.has(template.id))
    .map((template) => ({ id: template.id, title: template.label, description: '' }));
  return [...known, ...others];
}
