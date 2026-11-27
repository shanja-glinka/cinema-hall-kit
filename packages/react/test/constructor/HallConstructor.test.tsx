import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HallConfig, SaveResult } from '@cinema-hall/core';
import { HallConstructor } from '../../src/constructor/HallConstructor.js';
import type { SaveContext } from '../../src/constructor/types.js';
import { loadFixture, fixtureText } from './support.js';

vi.mock('../../src/seat-view/HallPreview.js', () => ({ HallPreview: () => null }));
afterEach(cleanup);

function chooseCentre() {
  fireEvent.click(screen.getByRole('button', { name: 'Section “Centre” · centre' }));
}
function commit(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
  fireEvent.blur(element);
}
function seats() {
  return screen.getByLabelText('Seats per row') as HTMLInputElement;
}
function count() {
  return document.querySelectorAll('[data-chk="editor-seat"]').length;
}

describe('canvas and contextual inspector', () => {
  it('starts with a hall summary and only shows the chosen section fields', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    expect(screen.getByText('126 seats')).toBeDefined();
    expect(screen.queryByLabelText('Seats per row')).toBeNull();
    chooseCentre();
    expect(seats().value).toBe('8');
    expect(screen.getByLabelText('Rows').getAttribute('placeholder')).toBe('7');
    expect(screen.queryByLabelText('Floor colour')).toBeNull();
    expect(document.querySelector('[data-section="centre"]')?.getAttribute('data-selected')).toBe(
      'true',
    );
  });

  it('commits the seat draft on blur and redraws the real plan', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    chooseCentre();
    const before = count();
    fireEvent.change(seats(), { target: { value: '9' } });
    expect(count()).toBe(before);
    fireEvent.blur(seats());
    expect(count()).toBe(before + 7);
  });

  it('adds a section at the band end with + and opens its inspector', async () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    fireEvent.click(
      screen.getByRole('button', { name: '+ Section to the right · Band 1 · Main hall' }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Id').getAttribute('value')).toBe('main-section-4'),
    );
    expect(
      document.querySelector('[data-chk="editor-section-object"][data-section="main-section-4"]'),
    ).not.toBeNull();
  });

  it('adds a row of sections and selects its band', async () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Row of sections' }));
    await waitFor(() => expect(screen.getByLabelText('Id').getAttribute('value')).toBe('band-3'));
    expect(document.querySelectorAll('[data-chk="editor-band-object"]')).toHaveLength(3);
  });

  it('deletes a selected section with Delete and undoes and redoes the removal', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    chooseCentre();
    const svg = document.querySelector('[data-chk="editor-plan"]')!;
    fireEvent.keyDown(svg, { key: 'Delete' });
    expect(document.querySelector('[data-section="centre"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(document.querySelector('[data-section="centre"]')).not.toBeNull();
    fireEvent.keyDown(svg, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(document.querySelector('[data-section="centre"]')).toBeNull();
  });

  it('an error badge opens the affected inspector and focuses the corrective field', async () => {
    render(<HallConstructor defaultValue={loadFixture()} onSave={async () => ({ ok: true })} />);
    chooseCentre();
    commit(seats(), '30');
    const badge = document.querySelector('[data-chk="editor-issue-badge"][data-severity="error"]');
    expect(badge).not.toBeNull();
    fireEvent.keyDown(document.querySelector('[data-chk="editor-plan"]')!, { key: 'Escape' });
    fireEvent.click(badge!);
    await waitFor(() => expect(document.activeElement).toBe(seats()));
    expect(
      (screen.getByRole('button', { name: /Save.*errors?/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(seats().getAttribute('aria-invalid')).toBe('true');
  });

  it('exclusion mode toggles an existing dot and keeps a target to restore it', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    chooseCentre();
    const before = count();
    fireEvent.click(screen.getByRole('button', { name: 'Remove seats' }));
    const seat = screen.getByRole('button', { name: 'Seat centre.r1.s1' });
    fireEvent.click(seat);
    expect(seat.getAttribute('data-excluded')).toBe('true');
    fireEvent.click(seat);
    expect(seat.hasAttribute('data-excluded')).toBe(false);
    expect(count()).toBe(before);
  });

  it('edits prices as plain units on the section tier and respects custom price formatting', async () => {
    const onSave = vi.fn(async (_config: HallConfig, _ctx: SaveContext): Promise<SaveResult> => ({
      ok: true,
    }));
    const config = loadFixture();
    config.pricing = { tiers: { standard: 450, recliner: 650 } };
    render(
      <HallConstructor defaultValue={config} onSave={onSave} formatPrice={(p) => `price ${p}`} />,
    );
    chooseCentre();
    commit(screen.getByLabelText('Seat price'), '475.25');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0].pricing).toEqual({
      tiers: { standard: 475.25, recliner: 650 },
    });
    expect(screen.getByText(/Shared by sections/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Hall overview' }));
    expect(screen.getByText('price 64774.5')).toBeDefined();
  });

  it('refuses removal of a used seat type and allows adding a new type', async () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    fireEvent.click(
      within(document.querySelector('[data-chk="editor-toolbar"]')!).getByRole('button', {
        name: 'Seats and prices',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove Classic' }));
    expect(
      screen.getByText('This type is used in the hall. Change its sections to another type first.'),
    ).toBeDefined();
    expect(document.querySelector('tr[data-seat-type="standard"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add seat type' }));
    await waitFor(() =>
      expect(document.querySelector('tr[data-seat-type="new-seat-type"]')).not.toBeNull(),
    );
  });

  it('read-only permits selection and refuses edits, deletion, add and exclusion', () => {
    render(
      <HallConstructor defaultValue={loadFixture()} onSave={async () => ({ ok: true })} readOnly />,
    );
    chooseCentre();
    expect(seats().disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Remove seats' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.keyDown(document.querySelector('[data-chk="editor-plan"]')!, { key: 'Delete' });
    fireEvent.click(
      screen.getByRole('button', { name: '+ Section to the right · Band 1 · Main hall' }),
    );
    expect(document.querySelectorAll('[data-chk="editor-section-object"]')).toHaveLength(6);
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('hidden and locked policies are applied to the selected object and structural controls', () => {
    render(
      <HallConstructor
        defaultValue={loadFixture()}
        policy={{
          'section.seatsPerRow': 'locked',
          'section.color': 'hidden',
          'structure.bands': 'hidden',
          pricing: 'hidden',
        }}
      />,
    );
    chooseCentre();
    expect(seats().disabled).toBe(true);
    expect(screen.queryByLabelText('Colour override')).toBeNull();
    expect(screen.queryByLabelText('Seat price')).toBeNull();
    expect(screen.queryByRole('button', { name: '+ Row of sections' })).toBeNull();
  });
});

describe('save responses on the new UI', () => {
  it('sends YAML comments, manifest, diff and revision; shows Saved', async () => {
    const onSave = vi.fn(async (_config: HallConfig, _ctx: SaveContext): Promise<SaveResult> => ({
      ok: true,
      revision: 8,
    }));
    render(
      <HallConstructor
        defaultValue={loadFixture()}
        source={fixtureText}
        revision={7}
        onSave={onSave}
      />,
    );
    chooseCentre();
    commit(seats(), '9');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('button', { name: 'Saved' });
    const ctx = onSave.mock.calls[0]?.[1];
    expect(ctx?.revision).toBe(7);
    expect(ctx?.yaml).toContain('# Cinema Hall Config');
    expect(ctx?.diff.added).toHaveLength(7);
    expect(ctx?.manifest.manifestVersion).toBe(1);
  });

  it('server validation appears on the canvas and at its inspector field', async () => {
    render(
      <HallConstructor
        defaultValue={loadFixture()}
        onSave={async () => ({
          ok: false,
          reason: 'invalid',
          issues: [
            {
              code: 'fit.width',
              severity: 'error',
              path: ['layout', 'bands', 0, 'sections', 1, 'seatsPerRow'],
              ref: { bandId: 'main', sectionId: 'centre' },
            },
          ],
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/server rejected/);
    const badge = document.querySelector('[data-chk="editor-issue-badge"][data-severity="error"]')!;
    fireEvent.click(badge);
    await waitFor(() => expect(seats().getAttribute('aria-invalid')).toBe('true'));
  });

  it('a thrown save error keeps the unsaved changes', async () => {
    render(
      <HallConstructor
        defaultValue={loadFixture()}
        onSave={async () => {
          throw new Error('offline');
        }}
      />,
    );
    chooseCentre();
    commit(seats(), '9');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Save failed: offline');
    expect(screen.getByText('Unsaved changes')).toBeDefined();
  });

  it('shows Saving while the request is pending', async () => {
    let finish: (result: SaveResult) => void = () => undefined;
    render(
      <HallConstructor
        defaultValue={loadFixture()}
        onSave={() =>
          new Promise((resolve) => {
            finish = resolve;
          })
        }
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await act(async () => finish({ ok: true }));
    await screen.findByRole('button', { name: 'Saved' });
  });
});

describe('navigation and pricing guards', () => {
  it('arrow keys move between objects, Enter selects, and Escape clears selection', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    const hall = screen.getByRole('button', { name: 'Hall' });
    hall.focus();
    fireEvent.keyDown(hall, { key: 'ArrowRight' });
    expect(screen.getByLabelText('Bottom edge above floor')).toBeDefined();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.getByText('126 seats')).toBeDefined();
    fireEvent.keyDown(document.querySelector('[data-section="centre"]')!, { key: 'Enter' });
    expect(seats().value).toBe('8');
  });

  it('zoom changes the plan transform and Fit restores it', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    const svg = document.querySelector('[data-chk="editor-plan"]')!;
    const before = svg.firstElementChild?.getAttribute('transform');
    fireEvent.wheel(svg, { deltaY: -100, clientX: 100, clientY: 100 });
    expect(svg.firstElementChild?.getAttribute('transform')).not.toBe(before);
    fireEvent.click(screen.getByRole('button', { name: 'Fit hall' }));
    expect(svg.firstElementChild?.getAttribute('transform')).toBe(before);
  });

  it('negative prices and more than two decimals stay as rejected drafts', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    chooseCentre();
    const input = screen.getByLabelText('Seat price');
    commit(input, '-1');
    expect(screen.getByText('At least 0')).toBeDefined();
    commit(input, '1.111');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Hall overview' }));
    chooseCentre();
    expect((screen.getByLabelText('Seat price') as HTMLInputElement).value).toBe('450');
  });

  it('a locked price has its normal lock message and cannot be edited', () => {
    render(<HallConstructor defaultValue={loadFixture()} policy={{ pricing: 'locked' }} />);
    chooseCentre();
    expect((screen.getByLabelText('Seat price') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Locked by the edit policy')).toBeDefined();
  });

  it('uses a custom neutral sign on the price editor', () => {
    render(
      <HallConstructor defaultValue={loadFixture()} labels={{ picker: { priceSign: 'units' } }} />,
    );
    chooseCentre();
    expect(screen.getByText('units')).toBeDefined();
  });
});
