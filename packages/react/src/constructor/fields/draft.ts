/**
 * Draft parsing for number inputs. The input keeps the text the user types (`""`, `"1."`, `"0,6"`);
 * only a finite number reaches the config, so `NaN` can never get there.
 */
export const NUMBER_PATTERN = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;

/**
 * The result of parsing a number draft: empty, invalid or a finite number.
 */
export type DraftParse =
  { kind: 'empty' } | { kind: 'invalid' } | { kind: 'number'; value: number };

/**
 * @param text Text typed by the user.
 * @param integer Whether only whole numbers are accepted.
 * @returns The parse result.
 */
export function parseNumberDraft(text: string, integer = false): DraftParse {
  const trimmed = text.trim();
  if (trimmed === '') return { kind: 'empty' };
  if (!NUMBER_PATTERN.test(trimmed)) return { kind: 'invalid' };
  const value = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(value)) return { kind: 'invalid' };
  if (integer && !Number.isInteger(value)) return { kind: 'invalid' };
  return { kind: 'number', value };
}

/**
 * Removes floating-point noise after a step: `0.1 + 0.2` becomes `0.3`.
 * @param value A number after a step.
 * @returns The value without floating-point noise.
 */
export function roundStep(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
