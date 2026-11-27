import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { builtInTemplates, templates } from '@cinema-hall/core';
import { HallConstructor } from '../../src/constructor/HallConstructor.js';
import { labels } from '../../src/labels/labels.js';

vi.mock('../../src/seat-view/HallPreview.js', () => ({ HallPreview: () => null }));
afterEach(cleanup);

const css = readFileSync('src/constructor/constructor.css', 'utf8');

describe('the canvas footer keeps its buttons clear of the hints', () => {
  it('puts the hints in one paragraph after the view tools, the mouse tip in its own span', () => {
    const { container } = render(<HallConstructor defaultValue={templates.balcony()} />);
    const footer = container.querySelector('[data-chk="editor-canvas-footer"]')!;
    const hint = footer.querySelector('[data-chk="editor-plan-hint"]')!;
    expect(hint.querySelector('[data-chk="editor-plan-tip"]')?.textContent).toBe(
      'Click to edit · scroll to zoom · drag to pan',
    );
    expect(hint.querySelector('[data-chk="editor-level-hint"]')).not.toBeNull();
    expect(footer.querySelector('[data-chk="editor-view-tools"]')).not.toBeNull();
  });

  it('gives the hints a full row under the buttons, and never lets buttons wrap their text', () => {
    const rule = (selector: string) => {
      const at = css.indexOf(`:where(${selector}) {`);
      expect(at).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf('}', at));
    };
    expect(rule("[data-chk='editor-plan-hint']")).toMatch(/flex: 1 0 100%/);
    expect(rule("[data-chk='editor-plan-hint']")).toMatch(/order: 3/);
    expect(rule("[data-chk='editor-canvas-footer']")).toMatch(/flex-wrap: wrap/);
    expect(rule("[data-chk='editor-view-tools'] [data-chk='button']")).toMatch(
      /white-space: nowrap/,
    );
    expect(rule("[data-chk='editor-view-tools'] [data-chk='button']")).toMatch(/flex: 0 0 auto/);
  });

  it('keeps the hints short', () => {
    expect(String(labels.en.editor.planHint).length).toBeLessThanOrEqual(60);
    expect(String(labels.en.editor.levelHint).length).toBeLessThanOrEqual(90);
  });
});

describe('templates from the template menu', () => {
  it('creates a hall with the English template texts', () => {
    render(<HallConstructor defaultValue={templates.single()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    fireEvent.click(screen.getByRole('button', { name: 'Two levels: stalls + balcony' }));
    expect(screen.getByDisplayValue(templates.balcony().name)).toBeDefined();
    expect(builtInTemplates.length).toBeGreaterThan(0);
  });
});
