import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateHall } from '@cinema-hall/core';
import { HallConstructor } from '../../src/constructor/HallConstructor.js';
import { loadFixture } from './support.js';

vi.mock('../../src/seat-view/HallPreview.js', () => ({ HallPreview: () => null }));
afterEach(cleanup);

const section = (name: string) => screen.getByRole('button', { name });
const bands = () => document.querySelectorAll('[data-chk="editor-band-object"]').length;
const sections = () => document.querySelectorAll('[data-chk="editor-section-object"]').length;

describe('deleting the only section of a band', () => {
  it('removes the whole band in one undo step and says so on the button', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    fireEvent.click(section('Section “Centre” · centre'));
    expect(screen.queryByText(/only section of its band/)).toBeNull();
    // Make `main` hold a single section by removing its two neighbours.
    fireEvent.click(section('Section “Left” · left'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    fireEvent.click(section('Section “Right” · right'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    fireEvent.click(section('Section “Centre” · centre'));
    expect(screen.getByText(/only section of its band/)).toBeDefined();
    expect(bands()).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Remove band' }));
    expect(bands()).toBe(1);
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(bands()).toBe(2);
    expect(sections()).toBe(4);
  });

  it('the last section of the last band is refused with a visible, dismissible reason', () => {
    const config = loadFixture();
    config.layout.bands = [
      { ...config.layout.bands[1]!, sections: [config.layout.bands[1]!.sections[0]!] },
    ];
    render(<HallConstructor defaultValue={config} />);
    fireEvent.click(document.querySelector('[data-chk="editor-section-object"]')!);
    fireEvent.click(screen.getByRole('button', { name: 'Remove band' }));
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('A hall needs at least one band');
    expect(sections()).toBe(1);
    fireEvent.click(within(alert).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('readable names and fitting new objects', () => {
  it('a new band and section are numbered, shown by name and never as a raw id', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Row of sections' }));
    expect(screen.getByRole('heading', { name: 'Band 3' })).toBeDefined();
    const plan = document.querySelector('[data-chk="editor-plan"]')!;
    expect(plan.textContent).toContain('Band 3');
    expect(plan.textContent).toContain('Section 7');
    expect(plan.textContent).not.toMatch(/\bband-3\b|\bsection-7\b/);
    fireEvent.click(section('Section 7 · section-7'));
    expect(screen.getByRole('heading', { name: 'Section 7' })).toBeDefined();
  });

  it('a band that cannot fit is flagged on itself with the numbers', () => {
    const config = loadFixture();
    let depth = config.hall.depth;
    const fits = (value: number) =>
      !validateHall({ ...config, hall: { ...config.hall, depth: value } }).some(
        (issue) => issue.code === 'fit.depth',
      );
    while (fits(depth - 0.05)) depth = Math.round((depth - 0.05) * 100) / 100;
    config.hall.depth = depth;
    render(<HallConstructor defaultValue={config} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Row of sections' }));
    const issues = document.querySelector('[data-chk="editor-object-issues"]');
    expect(issues?.textContent).toMatch(
      /Does not fit in depth: needs [\d.,]+ m, the hall is [\d.,]+ m/,
    );
    expect(
      document.querySelector('[data-chk="editor-issue-badge"][data-severity="error"]'),
    ).not.toBeNull();
  });

  it('a new band takes fewer rows when the hall has the room, and still fits', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Row of sections' }));
    expect(document.querySelector('[data-chk="editor-object-issues"]')).toBeNull();
  });
});

describe('messages that name their field', () => {
  it('a rejected value is explained with the field it belongs to', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    fireEvent.click(section('Section “Centre” · centre'));
    const input = screen.getByLabelText('Seats per row');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    expect(screen.getByText(/^Seats per row: value is below the minimum of 1/)).toBeDefined();
  });

  it('the inherited seat type reads "Same as band (type, price)"', () => {
    const config = loadFixture();
    config.pricing = { tiers: { standard: 450, recliner: 650 } };
    render(<HallConstructor defaultValue={config} formatPrice={(p) => `${p} u`} />);
    fireEvent.click(section('Section “Centre” · centre'));
    const select = screen.getByLabelText('Seat type') as HTMLSelectElement;
    const labels = Array.from(select.options).map((option) => option.textContent);
    expect(labels).toContain('Same as band (Classic, 450 u)');
  });
});

describe('history buttons', () => {
  it('are 20 px icons with a tooltip and an accessible name', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo.querySelector('svg')?.getAttribute('width')).toBe('20');
    expect(undo.parentElement?.getAttribute('title')).toBe('Undo (Ctrl+Z)');
    const redo = screen.getByRole('button', { name: 'Redo' });
    expect(redo.parentElement?.getAttribute('title')).toBe('Redo (Ctrl+Shift+Z)');
  });
});
