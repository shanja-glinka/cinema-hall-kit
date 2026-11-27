import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildHallLayout,
  parseHallConfig,
  validateHall,
  type HallConfig,
  type Issue,
  type SaveResult,
  type SectionBox,
} from '@cinema-hall/core';
import { HallConstructor } from '../../src/constructor/HallConstructor.js';
import { addBand } from '../../src/constructor/editor/bands.js';
import { addSection } from '../../src/constructor/editor/sections.js';
import { renameSeatType } from '../../src/constructor/editor/seat-types.js';
import { issueFix, issueFocusTarget, issuePlace } from '../../src/constructor/issues-view.js';
import {
  planTextScale,
  sectionLabelPlacement,
  touchesNeighbour,
} from '../../src/constructor/HallConstructorCanvas.js';
import { generatedName } from '../../src/constructor/ui/names.js';
import { NOTE_MS } from '../../src/constructor/toolbar/HallConstructorToolbar.js';
import { editorFog } from '../../src/scene/editor-lighting.js';
import { editorLabelsEn } from '../../src/labels/editor-labels.js';
import { formatLabel } from '../../src/labels/labels.js';
import { fixtureText, loadFixture } from './support.js';

const previewProps = vi.fn();
vi.mock('../../src/seat-view/HallPreview.js', () => ({
  HallPreview: (props: { children?: unknown }) => {
    previewProps(props);
    return <div data-testid="preview-3d" />;
  },
}));
vi.mock('../../src/seat-map/SeatMap.js', () => ({ SeatMap: () => null }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  previewProps.mockClear();
});

const L = editorLabelsEn;

function parsed(value: unknown): HallConfig {
  const result = parseHallConfig(value);
  if (!result.ok) throw new Error(result.issues.map((issue) => issue.code).join(', '));
  return result.config;
}
function errors(config: HallConfig): Issue[] {
  return validateHall(config).filter((issue) => issue.severity === 'error');
}
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
/** The fixture made as shallow as it can be while it still fits. */
function tightFixture(): HallConfig {
  const config = loadFixture();
  let depth = config.hall.depth;
  const fits = (value: number) =>
    !validateHall({ ...config, hall: { ...config.hall, depth: value } }).some(
      (issue) => issue.code === 'fit.depth',
    );
  while (fits(depth - 0.05)) depth = Math.round((depth - 0.05) * 100) / 100;
  config.hall.depth = depth;
  return config;
}

describe('error count wording and one-click fixes', () => {
  it('"1 error" in the singular, "2 errors" in the plural', () => {
    expect(formatLabel(L.errorCount, { count: 1 })).toBe('1 error');
    expect(formatLabel(L.errorCount, { count: 2 })).toBe('2 errors');
  });

  it('the Save button says "1 error" and a depth error offers to make the hall deeper', () => {
    const config = loadFixture();
    render(<HallConstructor defaultValue={config} onSave={async () => ({ ok: true })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Band 1 · Main hall' }));
    commit(screen.getByLabelText('Rows'), '12');
    expect(screen.getByRole('button', { name: /^Save\s*· 1 error$/ })).toBeDefined();
    const fix = screen.getAllByRole('button', { name: /^Make the hall [\d.]+ m deep$/ })[0]!;
    fireEvent.click(fix);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined();
    expect(
      document.querySelector('[data-chk="editor-issue-badge"][data-severity="error"]'),
    ).toBeNull();
  });

  it('issueFix rounds the needed size up to 5 cm and ignores other issues', () => {
    const issue: Issue = {
      severity: 'error',
      code: 'fit.depth',
      path: ['hall', 'depth'],
      params: { required: 16.22, available: 16 },
    };
    expect(issueFix(issue)).toEqual({ dimension: 'depth', value: 16.25 });
    expect(issueFix({ ...issue, code: 'fit.width' })).toEqual({ dimension: 'width', value: 16.25 });
    expect(issueFix({ ...issue, code: 'view.sightline' })).toBeNull();
  });

  it('issueFix clears an error whose shown size is rounded down (needs 8.002 m, shows 8.00 m)', () => {
    const config = loadFixture();
    const layout = buildHallLayout(config);
    const reach = Math.max(
      ...layout.seats.map((seat) => seat.position.z + layout.seatTypes[seat.seatTypeId]!.depth / 2),
    );
    // The hall is a whole number of metres deep and its seats need 2 mm more than that.
    const depth = Math.ceil(reach) + 2;
    const constraints = { minRearClearance: depth + 0.002 - reach };
    const hall = { ...config, hall: { ...config.hall, depth } };
    const issue = validateHall(hall, { constraints }).find((item) => item.code === 'fit.depth');
    expect(issue?.params?.required).toBe(depth);
    const fix = issueFix(issue!);
    expect(fix).toEqual({ dimension: 'depth', value: depth + 0.05 });
    const fixed = { ...hall, hall: { ...hall.hall, depth: fix!.value } };
    expect(validateHall(fixed, { constraints }).some((item) => item.code === 'fit.depth')).toBe(
      false,
    );
  });

  it('a depth error is placed on the band the issue names', () => {
    const config = loadFixture();
    const issue: Issue = {
      severity: 'error',
      code: 'fit.depth',
      path: ['hall', 'depth'],
      ref: { bandId: 'main' },
    };
    expect(issueFocusTarget(issue, config)).toEqual({
      path: ['layout', 'bands', 0],
      ref: { bandId: 'main' },
    });
  });
});

describe('issues with the same text say where they are', () => {
  it('each issue about a section names its band and section', () => {
    const config = loadFixture();
    const issues = validateHall(config).filter((issue) => issue.ref?.sectionId !== undefined);
    expect(issues.length).toBeGreaterThan(1);
    const places = issues.map((issue) => issuePlace(issue, config, L));
    expect(new Set(places).size).toBe(places.length);
    expect(places).toContain('Band 1 · Main hall › Section “Centre”');
    render(<HallConstructor defaultValue={config} />);
    const list = document.querySelector('[data-chk="editor-issues"]')!;
    expect(
      within(list as HTMLElement).getByRole('button', { name: /Section “Centre”/ }),
    ).toBeDefined();
  });

  it('an issue about the hall has no place', () => {
    const issue: Issue = { severity: 'error', code: 'fit.width', path: ['hall', 'width'] };
    expect(issuePlace(issue, loadFixture(), L)).toBeNull();
  });
});

describe('a new row of sections is valid and readable', () => {
  it('takes the first seat type, several seats, a band id and a section numbered in its band', () => {
    const config = loadFixture();
    const next = parsed(addBand(config));
    const band = next.layout.bands[2]!;
    expect(band.id).toBe('band-3');
    expect(band.sections.map((s) => s.id)).toEqual(['band-3-section-1']);
    expect(band.defaults?.seatType).toBe(Object.keys(config.seatTypes)[0]);
    expect(band.sections[0]!.seatsPerRow).toBeGreaterThanOrEqual(6);
    expect(errors(next)).toEqual([]);
  });

  it('growHall makes the hall deeper (to 5 cm) when even one row does not fit', () => {
    const config = tightFixture();
    const grown = parsed(addBand(config, { growHall: true }));
    expect(grown.hall.depth).toBeGreaterThan(config.hall.depth);
    expect(Math.round(grown.hall.depth * 20)).toBeCloseTo(grown.hall.depth * 20, 6);
    expect(errors(grown)).toEqual([]);
    const kept = parsed(addBand(config));
    expect(kept.hall.depth).toBe(config.hall.depth);
  });

  it('a new section is numbered within its band', () => {
    const next = parsed(addSection(loadFixture(), 'recliners', {}));
    expect(next.layout.bands[1]!.sections.at(-1)!.id).toBe('recliners-section-4');
    expect(generatedName('recliners-section-4', L, 'recliners')).toBe('Section 4');
    expect(generatedName('recliners-section-4', L)).toBeNull();
  });
});

describe('seat type ids come from their names', () => {
  it('a new type gets a readable id that follows its name until the hall is saved', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    openSeatTypes();
    fireEvent.click(screen.getByRole('button', { name: 'Add seat type' }));
    expect(document.querySelector('tr[data-seat-type="new-seat-type"]')).not.toBeNull();
    const row = document.querySelector<HTMLElement>('tr[data-seat-type="new-seat-type"]')!;
    commit(within(row).getByLabelText('Label'), 'Balcony');
    const renamed = document.querySelector<HTMLElement>('tr[data-seat-type="balcony"]');
    expect(renamed).not.toBeNull();
    expect((within(renamed!).getByLabelText('Short code') as HTMLInputElement).value).toBe(
      'balcony',
    );
  });

  it('a saved type keeps its id when renamed; its short code can be changed by hand', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    openSeatTypes();
    const row = document.querySelector<HTMLElement>('tr[data-seat-type="standard"]')!;
    commit(within(row).getByLabelText('Label'), 'Comfort');
    const kept = document.querySelector<HTMLElement>('tr[data-seat-type="standard"]')!;
    expect(kept).not.toBeNull();
    commit(within(kept).getByLabelText('Short code'), 'comfort');
    expect(document.querySelector('tr[data-seat-type="comfort"]')).not.toBeNull();
  });

  it('renameSeatType moves the sections, band defaults and price tier with the type', () => {
    const config = loadFixture();
    config.pricing = { tiers: { standard: 450, recliner: 650 } };
    const next = parsed(renameSeatType(config, 'standard', 'classic'));
    expect(Object.keys(next.seatTypes)[0]).toBe('classic');
    expect(next.pricing?.tiers).toEqual({ classic: 450, recliner: 650 });
    const uses = JSON.stringify(next.layout);
    expect(uses).not.toContain('"standard"');
    expect(errors(next)).toEqual([]);
    expect(() => renameSeatType(config, 'standard', 'recliner')).toThrow();
  });
});

describe('colours are stored in upper case', () => {
  it('a typed colour is saved as #RRGGBB', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    openSeatTypes();
    const row = document.querySelector<HTMLElement>('tr[data-seat-type="standard"]')!;
    const colour = within(row).getByLabelText('Colour') as HTMLInputElement;
    commit(colour, '#6e9fba');
    expect(colour.value).toBe('#6E9FBA');
  });
});

describe('save state and notices in the toolbar', () => {
  it('shows "Unsaved changes" after an edit and "All changes saved" after a save', async () => {
    render(
      <HallConstructor
        defaultValue={loadFixture()}
        onSave={async (): Promise<SaveResult> => ({ ok: true })}
      />,
    );
    const state = () => document.querySelector('[data-chk="editor-save-state"]')!;
    expect(state().textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: /^Hall / }));
    commit(screen.getByLabelText('Width'), '15');
    expect(state().textContent).toBe('Unsaved changes');
    expect(document.querySelector('[data-chk="editor-field"][data-applied]')).not.toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(state().textContent).toBe('All changes saved');
  });

  it('"Imported" is a neutral confirmation that goes away after the next edit or a few seconds', () => {
    vi.useFakeTimers();
    render(<HallConstructor defaultValue={loadFixture()} source={fixtureText} />);
    const importOnce = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Import' }));
      const dialog = screen.getByRole('dialog');
      fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: fixtureText } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Import' }));
    };
    importOnce();
    const status = screen.getByText('Imported');
    expect(status.getAttribute('data-tone')).toBe('success');
    act(() => {
      vi.advanceTimersByTime(NOTE_MS + 10);
    });
    expect(screen.queryByText('Imported')).toBeNull();
    importOnce();
    expect(screen.getByText('Imported')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /^Hall / }));
    commit(screen.getByLabelText('Width'), '15');
    expect(screen.queryByText('Imported')).toBeNull();
  });

  it('the hall name shows in full as a tooltip', () => {
    const config = loadFixture();
    config.name = 'Aurora Twin-Level with a long name';
    render(<HallConstructor defaultValue={config} />);
    expect(document.querySelector('[data-chk="editor-name"]')?.getAttribute('title')).toBe(
      config.name,
    );
  });
});

describe('inspector hints', () => {
  it('the band gap shows its default and explains it; the move buttons stay together', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Band 2 · Recliners' }));
    const gap = screen.getByLabelText('Gap before band') as HTMLInputElement;
    expect(gap.placeholder).not.toBe('');
    expect(screen.getByText(/Leave empty to use the row spacing/)).toBeDefined();
    const group = document.querySelector('[data-chk="editor-move-group"]')!;
    expect(group.querySelectorAll('button')).toHaveLength(2);
  });

  it('an inherited section field says it comes from the band; an override offers the band value', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Section “Centre” · centre' }));
    expect(screen.getByText(/Same as the band: 7\. Type a value/)).toBeDefined();
    commit(screen.getByLabelText('Rows'), '6');
    const reset = screen.getByRole('button', { name: 'Use the band value (7)' });
    expect(reset.closest('[data-chk="editor-field-actions"]')).not.toBeNull();
    fireEvent.click(reset);
    expect((screen.getByLabelText('Rows') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: 'Edit types…' }).getAttribute('data-chk')).toBe(
      'editor-link',
    );
  });

  it('a section after the first shows its aisle, 0 m by default', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Section “Centre” · centre' }));
    expect(screen.getByLabelText('Aisle before this section')).toBeDefined();
  });

  it('sections without an aisle touch on the plan', () => {
    const a = { bandId: 'b', sectionId: 'a', minX: 0, maxX: 2, minZ: 5, maxZ: 7 } as SectionBox;
    const b = { ...a, sectionId: 'b', minX: 2, maxX: 3 } as SectionBox;
    const c = { ...a, sectionId: 'c', minX: 4, maxX: 5 } as SectionBox;
    expect(touchesNeighbour(a, [a, b, c])).toBe(true);
    expect(touchesNeighbour(c, [a, b, c])).toBe(false);
  });
});

describe('plan text', () => {
  it('section names go inside the block when the band in front leaves no room', () => {
    const front = { bandId: 'a', sectionId: 'x', minX: 0, maxX: 4, minZ: 3, maxZ: 9 } as SectionBox;
    const behind = { ...front, bandId: 'b', sectionId: 'y', minZ: 9, maxZ: 11 } as SectionBox;
    expect(sectionLabelPlacement(behind, [front, behind], 0.34).inside).toBe(true);
    expect(sectionLabelPlacement(front, [front, behind], 0.34)).toEqual({ y: 2.9, inside: false });
  });

  it('plan text keeps a minimum size on screen, within limits', () => {
    expect(planTextScale(0)).toBe(1);
    expect(planTextScale(100)).toBe(1);
    expect(planTextScale(20)).toBeCloseTo(1.7, 5);
    expect(planTextScale(2)).toBe(2.4);
  });
});

describe('the editor 3D view has its own work light', () => {
  it('the preview gets the editor lighting, and its fog starts beyond the hall', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    fireEvent.click(screen.getByRole('button', { name: '3D' }));
    const children = previewProps.mock.calls.at(-1)?.[0].children as { props: { hall: unknown } };
    expect(children.props.hall).toEqual(loadFixture().hall);
    const fog = editorFog({ width: 14, depth: 26, height: 8 });
    expect(fog.near).toBeGreaterThan(26);
    expect(fog.far).toBeGreaterThan(fog.near);
  });
});
