import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { templates, type SectionBox } from '@cinema-hall/core';
import { HallConstructor } from '../../src/constructor/HallConstructor.js';
import { coveredByUpper } from '../../src/constructor/HallConstructorCanvas.js';
import { idDisplayName, objectName } from '../../src/constructor/ui/names.js';
import { editorLabelsEn } from '../../src/labels/editor-labels.js';
import { loadFixture } from './support.js';

vi.mock('../../src/seat-view/HallPreview.js', () => ({
  HallPreview: () => <div data-testid="preview-3d" />,
}));
afterEach(() => cleanup());

const L = editorLabelsEn;

function commit(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
  fireEvent.blur(element);
}
function openSeatTypes() {
  fireEvent.click(
    within(document.querySelector('[data-chk="editor-toolbar"]')!).getByRole('button', {
      name: 'Seats and prices',
    }),
  );
}
const box = (minX: number, maxX: number, minZ: number, maxZ: number): SectionBox =>
  ({ minX, maxX, minZ, maxZ }) as SectionBox;

describe('sections and bands have human names on the plan', () => {
  it('names balcony, stalls and lounge with the editor labels', () => {
    expect(objectName('balcony', L)).toBe('Balcony');
    expect(objectName('stalls', L)).toBe('Stalls');
    expect(objectName('lounge', L)).toBe('Lounge');
    expect(objectName('balcony', { ...L, balconyName: 'Gallery' })).toBe('Gallery');
  });

  it('calls a section named after its band and a side by its side', () => {
    expect(objectName('lounge-left', L, 'lounge')).toBe('Left');
    expect(objectName('lounge-centre', L, 'lounge')).toBe('Centre');
    expect(objectName('balcony-right', L, 'balcony')).toBe('Right');
  });

  it('never shows a raw id: other ids become names, like core issue texts', () => {
    expect(objectName('vip-block', L)).toBe('Vip block');
    expect(objectName('lounge-left', L)).toBe('Lounge left');
    expect(idDisplayName('rear_rows')).toBe('Rear rows');
    expect(idDisplayName('--')).toBe('--');
  });

  it('the plan of the two-level template shows no lowercase section ids', () => {
    render(<HallConstructor defaultValue={templates.balcony()} />);
    const names = [...document.querySelectorAll('[data-chk="editor-section-object"] text')].map(
      (node) => node.textContent ?? '',
    );
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name).not.toMatch(/^[a-z]/);
  });
});

describe('the plan of a hall with a balcony is easy to read', () => {
  it('a floor block is covered when a balcony block overlaps it', () => {
    expect(coveredByUpper(box(-2, 2, 10, 12), [box(-3, 3, 11, 14)])).toBe(true);
    expect(coveredByUpper(box(-2, 2, 4, 8), [box(-3, 3, 11, 14)])).toBe(false);
    expect(coveredByUpper(box(-2, 2, 10, 12), [])).toBe(false);
  });

  it('"All levels" dims the floor under the balcony and shows a legend', () => {
    render(<HallConstructor defaultValue={templates.balcony()} />);
    const plan = document.querySelector('[data-chk="editor-plan"]')!;
    const covered = [...plan.querySelectorAll('[data-chk="editor-band-group"][data-covered]')];
    expect(covered.length).toBeGreaterThan(0);
    for (const group of covered) expect(group.getAttribute('data-level')).toBe('0');
    expect(
      plan.querySelector('[data-chk="editor-band-group"][data-band="balcony"][data-covered]'),
    ).toBeNull();
    const legend = document.querySelector('[data-chk="editor-level-legend"]');
    expect(legend?.textContent).toContain('Solid: ground floor (stalls)');
    expect(legend?.textContent).toContain('Dashed: balcony above it');

    // One level at a time: no legend and no dimming.
    fireEvent.click(
      within(document.querySelector('[data-chk="editor-level-filter"]') as HTMLElement).getByRole(
        'button',
        { name: 'Ground floor' },
      ),
    );
    expect(document.querySelector('[data-chk="editor-level-legend"]')).toBeNull();
    expect(plan.querySelector('[data-covered]')).toBeNull();
  });

  it('a hall on one level has no legend and nothing covered', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    expect(document.querySelector('[data-chk="editor-level-legend"]')).toBeNull();
    expect(document.querySelector('[data-covered]')).toBeNull();
  });
});

describe('the short code of a seat type is under "Advanced"', () => {
  it('is in a closed disclosure with a one-line explanation, and still works', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    openSeatTypes();
    const row = document.querySelector<HTMLElement>('tr[data-seat-type="standard"]')!;
    const details = row.querySelector<HTMLDetailsElement>('details[data-chk="editor-advanced"]')!;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent).toBe('Advanced');
    const code = within(details).getByLabelText('Short code');
    expect(details.textContent).toContain('You do not need to change it.');
    commit(code, 'comfort');
    expect(document.querySelector('tr[data-seat-type="comfort"]')).not.toBeNull();
  });
});

describe('a changed field says the change is not saved yet', () => {
  it('flashes "Changed — not saved yet" while the toolbar says there are unsaved changes', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    openSeatTypes();
    const row = document.querySelector<HTMLElement>('tr[data-seat-type="standard"]')!;
    commit(within(row).getByLabelText('Label'), 'Comfort');
    expect(document.querySelector('[data-chk="editor-applied"]')?.textContent).toBe(
      'Changed — not saved yet',
    );
    expect(
      document.querySelector('[data-chk="editor-save-state"][data-state="dirty"]')?.textContent,
    ).toBe('Unsaved changes');
    expect(screen.getAllByText('Changed — not saved yet').length).toBeGreaterThan(0);
  });
});

describe('seat map taller than its area', () => {
  it('is centred safely, so its top rows are never out of reach', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(here, '../../src/seat-picker/seat-picker.css'), 'utf8');
    const block = /:where\(\[data-chk='map-layer'\]\) \{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(block).toContain('justify-content: safe center;');
  });
});
