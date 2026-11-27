/**
 * A reservation the server refused for a selection rule, in the viewer's words. The server answers
 * with the rule's code after `SELECTION_RULE_PREFIX` (`selection_rule:noSingleGap`); the picker
 * shows an answer's message as it is, so the page puts the sentence the picker uses for the same
 * rule in its place.
 */
import type { BookResult } from '@cinema-hall/core';
import { formatLabel, type PickerLabels } from '@cinema-hall/react';
import { SELECTION_RULE_PREFIX } from './texts';

/**
 * The answer with a selection-rule refusal put into words; any other answer as it is.
 * @param result The server's answer to a reservation.
 * @param labels The picker labels in use: `violations[code]`, or `error` for a rule without a text.
 * @param params Values for the texts, such as `max` (the most seats one reservation may have).
 * @returns The answer to give the picker.
 */
export function explainRefusal(
  result: BookResult,
  labels: PickerLabels,
  params: Record<string, string | number> = {},
): BookResult {
  if (result.ok || result.reason !== 'error') return result;
  const message = result.message;
  if (message === undefined || !message.startsWith(SELECTION_RULE_PREFIX)) return result;
  const code = message.slice(SELECTION_RULE_PREFIX.length);
  const label = Object.hasOwn(labels.violations, code) ? labels.violations[code] : undefined;
  return { ...result, message: formatLabel(label ?? labels.error, params) };
}
