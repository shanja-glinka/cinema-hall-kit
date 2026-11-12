import { describe, expect, it } from 'vitest';
import { parseNumberDraft, roundStep } from '../../src/constructor/fields/draft.js';

describe('number drafts', () => {
  it('reads partial input without committing a wrong value', () => {
    expect(parseNumberDraft('')).toEqual({ kind: 'empty' });
    expect(parseNumberDraft('1.')).toEqual({ kind: 'number', value: 1 });
    expect(parseNumberDraft('0,6')).toEqual({ kind: 'number', value: 0.6 });
    expect(parseNumberDraft('.5')).toEqual({ kind: 'number', value: 0.5 });
    expect(parseNumberDraft('-')).toEqual({ kind: 'invalid' });
    expect(parseNumberDraft('.')).toEqual({ kind: 'invalid' });
    expect(parseNumberDraft('NaN')).toEqual({ kind: 'invalid' });
    expect(parseNumberDraft('Infinity')).toEqual({ kind: 'invalid' });
    expect(parseNumberDraft('1e3')).toEqual({ kind: 'invalid' });
  });

  it('whole numbers are required when asked for', () => {
    expect(parseNumberDraft('3', true)).toEqual({ kind: 'number', value: 3 });
    expect(parseNumberDraft('1.5', true)).toEqual({ kind: 'invalid' });
  });

  it('never produces NaN', () => {
    for (const text of ['', ' ', ',', '--1', '1..2', 'abc', '1,2,3']) {
      const parsed = parseNumberDraft(text);
      if (parsed.kind === 'number') expect(Number.isNaN(parsed.value)).toBe(false);
    }
  });

  it('roundStep removes floating-point noise', () => {
    expect(roundStep(0.1 + 0.2)).toBe(0.3);
  });
});
