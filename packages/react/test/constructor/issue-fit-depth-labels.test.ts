import { describe, expect, it } from 'vitest';
import { issueMessages, type Issue } from '@cinema-hall/core';
import { describeIssue } from '../../src/constructor/issues-view.js';
import { editorLabelsEn } from '../../src/labels/editor-labels.js';

const issue: Issue = {
  code: 'fit.depth',
  severity: 'error',
  path: ['layout', 'bands'],
  params: { required: 16.25, available: 14 },
};

describe('fit.depth text and the older labels.editor.issueFitDepth', () => {
  const legacy = { ...editorLabelsEn, issueFitDepth: 'Too deep: {required} of {available} m' };

  it('uses the built-in text when nothing is overridden', () => {
    const text = describeIssue(issue, editorLabelsEn, 'en', issueMessages.en);
    expect(text).toBe(describeIssue(issue, editorLabelsEn, 'en'));
    expect(text).not.toContain('Too deep');
  });

  it('keeps a host override of labels.editor.issueFitDepth', () => {
    expect(describeIssue(issue, legacy, 'en', issueMessages.en)).toBe('Too deep: 16.25 of 14 m');
    expect(describeIssue(issue, legacy, 'de-DE')).toBe('Too deep: 16,25 of 14 m');
  });

  it('a fit.depth text of the issue catalog wins over the older label', () => {
    const messages = { ...issueMessages.en, 'fit.depth': 'Catalog: {required}' };
    expect(describeIssue(issue, legacy, 'en', messages)).toBe('Catalog: 16.25');
  });
});
