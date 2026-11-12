import { describe, expect, it } from 'vitest';
import type { Issue } from '../src/issues.js';
import { formatIssue, validateHall, type ValidationRule } from '../src/validation.js';
import { fixtureConfig } from './support.js';

const custom = (code: string): Issue => ({ severity: 'warning', code, path: ['name'] });

describe('issue codes are looked up as own keys only', () => {
  it.each(['constructor', 'toString', '__proto__'])(
    'keeps the severity of a custom %s issue when severities are given',
    (code) => {
      const rule: ValidationRule = { code, check: () => [custom(code)] };
      expect(validateHall(fixtureConfig(), { extraRules: [rule], severity: {} })).toContainEqual(
        expect.objectContaining({ code, severity: 'warning' }),
      );
    },
  );

  it('formats a custom code without a text as the code itself', () => {
    expect(formatIssue(custom('constructor'))).toBe('constructor');
    expect(formatIssue(custom('toString'), undefined, 'en-US')).toBe('toString');
  });

  it('fills placeholders only from the own params of the issue', () => {
    const messages = { 'acme.custom': 'value {constructor} and {name}' };
    const bare: Issue = { severity: 'error', code: 'acme.custom', path: [] };
    expect(formatIssue(bare, messages)).toBe('value {constructor} and {name}');
    expect(formatIssue({ ...bare, params: { name: 'x' } }, messages)).toBe(
      'value {constructor} and x',
    );
  });
});

describe('a missing option map is read as empty', () => {
  it('formats an issue with null messages as with no messages', () => {
    const issue: Issue = {
      severity: 'error',
      code: 'schema.unknownKey',
      path: [],
      params: { key: 'x' },
    };
    expect(formatIssue(issue, null as unknown as undefined)).toBe('Unknown field "x"');
  });

  it('validates with a null severity map as with no severity map', () => {
    expect(validateHall(fixtureConfig(), { severity: null as unknown as undefined })).toEqual(
      validateHall(fixtureConfig()),
    );
  });
});
