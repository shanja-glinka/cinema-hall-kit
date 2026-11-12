import { describe, expect, it } from 'vitest';
import { BUILT_IN_ISSUE_CODES, type Issue } from '../src/issues.js';
import { formatIssue, issueMessages, validateEdit } from '../src/validation.js';
import { fixtureConfig } from './support.js';

const issue = (code: string, params?: Issue['params']): Issue => ({
  severity: 'error',
  code,
  path: [],
  ...(params ? { params } : {}),
});

describe('formatIssue', () => {
  const fit = issue('fit.width', { required: 12.4, available: 12 });

  it('uses English by default and fills the params', () => {
    expect(formatIssue(fit)).toBe(
      'A row with its wall clearance needs 12.4 m; the hall is 12 m wide',
    );
  });

  it('uses English for every locale', () => {
    expect(formatIssue(fit, undefined, 'en-US')).toContain('needs 12.4 m');
    expect(formatIssue(fit, undefined, 'en-GB')).toContain('needs 12.4 m');
  });

  it('prefers custom messages, as text or as a function, in any locale', () => {
    expect(formatIssue(fit, { 'fit.width': 'Need {required}, have {available}' }, 'de-DE')).toBe(
      'Need 12.4, have 12',
    );
    expect(formatIssue(fit, { 'fit.width': (p) => `fn ${p.available}` })).toBe('fn 12');
  });

  it('returns the code for an unknown code and keeps placeholders without params', () => {
    expect(formatIssue(issue('acme.custom'))).toBe('acme.custom');
    expect(formatIssue(issue('schema.unknownKey'))).toBe('Unknown field "{key}"');
  });

  it('has English text for every built-in code, including the legacy locale alias', () => {
    for (const code of BUILT_IN_ISSUE_CODES) {
      expect(issueMessages.en[code]).toBeTruthy();
      expect(issueMessages.ru[code]).toBeTruthy();
      expect(issueMessages.ru[code]).toBe(issueMessages.en[code]);
    }
    expect(issueMessages.en['field.locked']).toContain('locked');
  });
});

describe('validateEdit', () => {
  const policy = (entries: Record<string, 'editable' | 'locked' | 'hidden'>) =>
    entries as Parameters<typeof validateEdit>[2];

  it('reports nothing for an unchanged config', () => {
    expect(validateEdit(fixtureConfig(), fixtureConfig(), {})).toEqual([]);
  });

  it('reports a locked leaf field with its path and field key', () => {
    const next = fixtureConfig();
    next.hall.width = 15;
    expect(validateEdit(fixtureConfig(), next, policy({ 'hall.width': 'locked' }))).toEqual([
      {
        severity: 'error',
        code: 'field.locked',
        path: ['hall', 'width'],
        params: { field: 'hall.width' },
      },
    ]);
  });

  it('reports a hidden field too, and ignores editable ones', () => {
    const next = fixtureConfig();
    next.hall.width = 15;
    next.hall.depth = 17;
    const issues = validateEdit(
      fixtureConfig(),
      next,
      policy({ 'hall.width': 'hidden', 'hall.depth': 'editable' }),
    );
    expect(issues.map((i) => i.params?.field)).toEqual(['hall.width']);
  });

  it('maps a section field through its id, not its index', () => {
    const next = fixtureConfig();
    next.layout.bands[0]!.sections[1]!.seatPitch = 0.62;
    const issues = validateEdit(fixtureConfig(), next, policy({ 'section.seatPitch': 'locked' }));
    expect(issues).toEqual([
      expect.objectContaining({
        path: ['layout', 'bands', 0, 'sections', 1, 'seatPitch'],
        params: { field: 'section.seatPitch' },
      }),
    ]);
  });

  it('maps band and section reordering to structure fields', () => {
    const bands = fixtureConfig();
    bands.layout.bands.reverse();
    expect(validateEdit(fixtureConfig(), bands, policy({ 'structure.bands': 'locked' }))).toEqual([
      expect.objectContaining({ path: ['layout', 'bands'], params: { field: 'structure.bands' } }),
    ]);

    const sections = fixtureConfig();
    sections.layout.bands[0]!.sections.reverse();
    expect(
      validateEdit(fixtureConfig(), sections, policy({ 'structure.sections': 'locked' })),
    ).toEqual([
      expect.objectContaining({
        path: ['layout', 'bands', 0, 'sections'],
        params: { field: 'structure.sections' },
      }),
    ]);
  });

  it('maps added and removed seat types to structure.seatTypes', () => {
    const added = fixtureConfig();
    added.seatTypes.vip = { label: 'VIP', width: 0.6, depth: 0.95, color: '#D4AF37' };
    expect(
      validateEdit(fixtureConfig(), added, policy({ 'structure.seatTypes': 'locked' }))[0]?.params,
    ).toEqual({
      field: 'structure.seatTypes',
    });
    const removed = fixtureConfig();
    delete removed.seatTypes.recliner;
    expect(
      validateEdit(fixtureConfig(), removed, policy({ 'structure.seatTypes': 'locked' })),
    ).toHaveLength(1);
  });

  it('treats a seat type colour, meta and array elements by their own field keys', () => {
    const next = fixtureConfig();
    next.seatTypes.standard!.color = '#000000';
    next.meta = { hallType: 'Standard' };
    const issues = validateEdit(
      fixtureConfig(),
      next,
      policy({ 'seatType.color': 'locked', meta: 'hidden' }),
    );
    expect(issues.map((i) => i.params?.field).sort()).toEqual(['meta', 'seatType.color']);
  });

  it('reports a changed exclude list and a changed array length', () => {
    const next = fixtureConfig();
    next.layout.bands[0]!.sections[1]!.exclude = ['r1.s1'];
    expect(
      validateEdit(fixtureConfig(), next, policy({ 'section.exclude': 'locked' })),
    ).toHaveLength(1);
    const longer = fixtureConfig();
    longer.layout.rowLabels = ['A', 'B'];
    expect(
      validateEdit(fixtureConfig(), longer, policy({ 'layout.rowLabels': 'locked' })),
    ).toHaveLength(1);
  });

  it('reports an added or removed optional key once', () => {
    const next = fixtureConfig();
    delete next.constraints;
    next.hall.wallColor = undefined;
    next.hall.floorColor = undefined;
    const issues = validateEdit(
      fixtureConfig(),
      next,
      policy({ constraints: 'locked', 'hall.wallColor': 'locked' }),
    );
    expect(issues.map((i) => i.params?.field).sort()).toEqual(['constraints', 'hall.wallColor']);
  });
});
