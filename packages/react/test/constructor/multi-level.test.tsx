import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildHallLayout,
  builtInTemplates,
  templates,
  validateHall,
  type HallConfig,
} from '@cinema-hall/core';
import { HallConstructor } from '../../src/constructor/HallConstructor.js';
import { sectionLabelPlacement } from '../../src/constructor/HallConstructorCanvas.js';
import { templateLabel } from '../../src/constructor/toolbar/TemplateMenu.js';
import { balconyMinElevation, balconyPlacement } from '../../src/constructor/editor/bands.js';
import { editorLabelsEn } from '../../src/labels/editor-labels.js';

vi.mock('../../src/seat-view/HallPreview.js', () => ({
  HallPreview: () => <div data-testid="preview-3d" />,
}));
afterEach(() => cleanup());

/** The balcony template with its balcony put back behind the recliners, on the ground floor. */
function flatBalcony(): HallConfig {
  const config = templates.balcony();
  const bands = config.layout.bands.map((band) => {
    if (band.id !== 'balcony') return band;
    const { startDistance: _start, elevation: _elevation, ...rest } = band;
    return rest;
  });
  return { ...config, hall: { ...config.hall, depth: 19 }, layout: { ...config.layout, bands } };
}

const plan = () => document.querySelector('[data-chk="editor-plan"]') as SVGSVGElement;
const levelButton = (name: string) =>
  within(document.querySelector('[data-chk="editor-level-filter"]') as HTMLElement).getByRole(
    'button',
    { name },
  );

describe('balcony placement', () => {
  it('puts the band over the rear of the band in front, with headroom under it', () => {
    const config = templates.balcony();
    // Its first row's slab is over the front recliner row (floor 1.85): 1.85 + 2.4 + 0.3. The
    // balcony's rising rows keep the headroom over the rear recliner row.
    expect(balconyPlacement(config, 'balcony')).toEqual({ startDistance: 12.7, elevation: 4.55 });
    // A band that is already lifted gets the same suggestion as before.
    const unlifted = flatBalcony();
    expect(balconyPlacement({ ...unlifted, hall: config.hall }, 'balcony')).toEqual(
      balconyPlacement(config, 'balcony'),
    );
    expect(balconyPlacement(unlifted, 'balcony')).toEqual({ startDistance: 14.2, elevation: 4.9 });
    expect(balconyPlacement(config, 'stalls')).toBeNull();
    expect(balconyMinElevation(config, 'balcony', 12)).toBe(4.55);
    expect(balconyMinElevation(config, 'balcony', 12, { minOverhangClearance: 3 })).toBe(5.15);
  });

  it('gives a placement the validation accepts as a balcony', () => {
    const config = templates.balcony();
    const place = balconyPlacement(config, 'balcony')!;
    const lifted: HallConfig = {
      ...config,
      layout: {
        ...config.layout,
        bands: config.layout.bands.map((band) =>
          band.id === 'balcony' ? { ...band, ...place } : band,
        ),
      },
    };
    const codes = validateHall(lifted).map((issue) => issue.code);
    expect(codes).not.toContain('layout.bandOverlap');
    expect(buildHallLayout(lifted).bands.find((band) => band.id === 'balcony')?.level).toBe(1);
  });

  it('counts a raised band behind it under the slab, as the validation does', () => {
    // A ground-floor band with a high floor behind the balcony's seats: the balcony's slab runs back
    // to the rear wall over it, so the suggested floor must leave the headroom there too.
    const base = templates.balcony();
    const config: HallConfig = {
      ...base,
      hall: { ...base.hall, depth: 20 },
      layout: {
        ...base.layout,
        bands: [
          ...base.layout.bands,
          {
            id: 'rear',
            startDistance: 17.5,
            elevation: 3.8,
            defaults: { rows: 1, rowSpacing: 0.95, seatPitch: 0.6, seatType: 'standard' },
            sections: [{ id: 'rear-centre', seatsPerRow: 10 }],
          },
        ],
      },
    };
    const place = balconyPlacement(config, 'balcony')!;
    const lifted: HallConfig = {
      ...config,
      layout: {
        ...config.layout,
        bands: config.layout.bands.map((band) =>
          band.id === 'balcony' ? { ...band, ...place } : band,
        ),
      },
    };
    expect(validateHall(lifted).map((issue) => issue.code)).not.toContain('layout.bandOverlap');
    expect(place.elevation).toBeGreaterThan(4.9);
    // The lowest floor it suggests is the lowest one the validation accepts.
    const lower: HallConfig = {
      ...lifted,
      layout: {
        ...lifted.layout,
        bands: lifted.layout.bands.map((band) =>
          band.id === 'balcony' ? { ...band, elevation: place.elevation - 0.05 } : band,
        ),
      },
    };
    expect(validateHall(lower).map((issue) => issue.code)).toContain('layout.bandOverlap');
    expect(balconyMinElevation(config, 'balcony', place.startDistance)).toBe(place.elevation);
  });
});

describe('upper-level switch in the band panel', () => {
  it('turns a band into a balcony and back', () => {
    render(<HallConstructor defaultValue={flatBalcony()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Band 3 · Balcony' }));
    const toggle = screen.getByLabelText(
      'Upper level (balcony) above the bands in front',
    ) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(screen.queryByLabelText('Starts at')).toBeNull();
    expect(document.querySelector('[data-chk="editor-level-filter"]')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);
    const start = screen.getByLabelText('Starts at') as HTMLInputElement;
    const floor = screen.getByLabelText('Floor height') as HTMLInputElement;
    expect(Number(start.value)).toBeGreaterThan(12);
    expect(Number(floor.value)).toBe(4.9);
    expect(screen.getByText('m from the screen')).toBeDefined();
    expect(screen.getByText(/use at least 4\.9 m/)).toBeDefined();
    // The plan now has two levels.
    expect(document.querySelector('[data-chk="editor-level-filter"]')).not.toBeNull();

    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(screen.queryByLabelText('Starts at')).toBeNull();
    expect(document.querySelector('[data-chk="editor-level-filter"]')).toBeNull();
  });

  it('is not offered on the first band', () => {
    render(<HallConstructor defaultValue={templates.balcony()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Band 1 · Stalls' }));
    expect(screen.queryByLabelText('Upper level (balcony) above the bands in front')).toBeNull();
    expect(screen.getByText(editorLabelsEn.bandUpperLevelFirst as string)).toBeDefined();
  });
});

describe('plan of a hall with a balcony', () => {
  it('draws the balcony as an upper level over the stalls, with a badge', () => {
    render(<HallConstructor defaultValue={templates.balcony()} />);
    const svg = plan();
    const balcony = svg.querySelector('[data-chk="editor-band-group"][data-band="balcony"]');
    expect(balcony?.getAttribute('data-level')).toBe('1');
    expect(balcony?.hasAttribute('data-upper')).toBe(true);
    expect(balcony?.querySelector('[data-chk="editor-level-outline"]')).not.toBeNull();
    expect(balcony?.querySelector('[data-level-badge]')?.textContent).toBe('Balcony · level 1');
    // Upper levels come last, so they are on top and take the clicks where they overlap.
    const groups = [...svg.querySelectorAll('[data-chk="editor-band-group"]')];
    expect(groups.at(-1)).toBe(balcony);
    expect(
      svg
        .querySelector('[data-chk="editor-band-group"][data-band="stalls"]')
        ?.hasAttribute('data-upper'),
    ).toBe(false);
    // Band labels of overlapping bands do not sit on each other.
    const rects = [...svg.querySelectorAll('[data-chk="editor-band-object"] > rect')].map(
      (rect) => ({
        y: Number(rect.getAttribute('y')),
        h: Number(rect.getAttribute('height')),
      }),
    );
    rects.sort((a, b) => a.y - b.y);
    for (let i = 1; i < rects.length; i++)
      expect(rects[i]!.y).toBeGreaterThanOrEqual(rects[i - 1]!.y + rects[i - 1]!.h);
  });

  it('filters the plan by level, so the bands under the balcony can be selected', () => {
    render(<HallConstructor defaultValue={templates.balcony()} />);
    expect(levelButton('All levels').getAttribute('aria-pressed')).toBe('true');
    expect(levelButton('Level 1')).toBeDefined();
    fireEvent.click(levelButton('Ground floor'));
    expect(levelButton('Ground floor').getAttribute('aria-pressed')).toBe('true');
    const svg = plan();
    // The balcony is only an outline now and cannot be clicked.
    expect(svg.querySelector('[data-chk="editor-level-ghost"][data-level="1"]')).not.toBeNull();
    expect(svg.querySelector('[data-section="balcony"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Band 3 · Balcony' })).toBeNull();
    fireEvent.click(svg.querySelector('[data-section="rec-centre"]') as Element);
    expect(svg.querySelector('[data-section="rec-centre"]')?.hasAttribute('data-selected')).toBe(
      true,
    );

    fireEvent.click(levelButton('Level 1'));
    expect(svg.querySelector('[data-section="rec-centre"]')).toBeNull();
    expect(svg.querySelector('[data-section="balcony"]')).not.toBeNull();
  });

  it('dims the other levels while an object of one level is selected', () => {
    render(<HallConstructor defaultValue={templates.balcony()} />);
    const svg = plan();
    fireEvent.click(svg.querySelector('[data-section="balcony"]') as Element);
    expect(
      svg
        .querySelector('[data-chk="editor-band-group"][data-band="stalls"]')
        ?.hasAttribute('data-dimmed'),
    ).toBe(true);
    expect(
      svg
        .querySelector('[data-chk="editor-band-group"][data-band="balcony"]')
        ?.hasAttribute('data-dimmed'),
    ).toBe(false);
  });

  it('shows the level of an object selected from an issue', () => {
    const config = templates.balcony();
    // Too low: the seats under the balcony lose their headroom.
    const low: HallConfig = {
      ...config,
      layout: {
        ...config.layout,
        bands: config.layout.bands.map((band) =>
          band.id === 'balcony' ? { ...band, elevation: 3.5 } : band,
        ),
      },
    };
    expect(validateHall(low).some((issue) => issue.code === 'layout.bandOverlap')).toBe(true);
    render(<HallConstructor defaultValue={low} />);
    fireEvent.click(levelButton('Ground floor'));
    const issue = [...document.querySelectorAll('[data-chk="editor-issue-text"]')].find((node) =>
      /Balcony/.test(node.textContent ?? ''),
    );
    expect(issue).toBeDefined();
    fireEvent.click(issue!.closest('button') as HTMLElement);
    expect(levelButton('Level 1').getAttribute('aria-pressed')).toBe('true');
    expect(
      plan()
        .querySelector('[data-chk="editor-band-object"][data-upper]')
        ?.hasAttribute('data-selected'),
    ).toBe(true);
  });

  it('keeps section names off the floor below', () => {
    const layout = buildHallLayout(templates.balcony());
    const balcony = layout.sections.find((box) => box.sectionId === 'balcony')!;
    expect(sectionLabelPlacement(balcony, layout.sections, 0.34).inside).toBe(true);
    const stalls = layout.sections.find((box) => box.sectionId === 'centre')!;
    expect(sectionLabelPlacement(stalls, layout.sections, 0.34).inside).toBe(false);
  });
});

describe('template menu', () => {
  it('offers the two-level template by its name', () => {
    const balcony = builtInTemplates.find((template) => template.id === 'balcony')!;
    expect(templateLabel(balcony, editorLabelsEn)).toBe('Two levels: stalls + balcony');
    render(<HallConstructor defaultValue={templates.single()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    expect(screen.getByRole('button', { name: 'Two levels: stalls + balcony' })).toBeDefined();
  });
});

describe('band labels of many short bands', () => {
  it('stay inside the fitted plan when they stack below the hall', () => {
    const base = templates.single();
    const seatType = Object.keys(base.seatTypes)[0]!;
    const bands = Array.from({ length: 32 }, (_, i) => ({
      id: `band-${i + 1}`,
      defaults: { rows: 1, rowSpacing: 0.8, seatPitch: 0.6, seatType },
      sections: [{ id: `band-${i + 1}-section-1`, seatsPerRow: 4 }],
    }));
    const config: HallConfig = {
      ...base,
      hall: { ...base.hall, depth: 32 },
      layout: { ...base.layout, bands },
    };
    render(<HallConstructor defaultValue={config} />);
    const [, y, , height] = plan().getAttribute('viewBox')!.split(' ').map(Number);
    const rects = [...plan().querySelectorAll('[data-chk="editor-band-object"] > rect')].map(
      (rect) => Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')),
    );
    expect(rects).toHaveLength(32);
    // The stack really runs past the hall here, so the check is not vacuous.
    expect(Math.max(...rects)).toBeGreaterThan(config.hall.depth);
    expect(Math.max(...rects)).toBeLessThanOrEqual(y! + height!);
  });
});
