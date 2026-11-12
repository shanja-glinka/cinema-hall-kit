import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HallConstructor } from '../../src/constructor/HallConstructor.js';
import { loadFixture } from './support.js';

const previewProps = vi.fn();
vi.mock('../../src/seat-view/HallPreview.js', () => ({
  HallPreview: (props: { highlightSections?: string[] }) => {
    previewProps(props);
    return <div data-testid="preview-3d" />;
  },
}));
afterEach(() => {
  cleanup();
  previewProps.mockClear();
});

describe('canvas objects, views and inspector links', () => {
  it('selects the hall, the screen and a band from the plan', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Screen' }));
    expect((screen.getByLabelText('Screen to first row') as HTMLInputElement).value).toBe('4.95');
    fireEvent.click(screen.getByRole('button', { name: 'Hall' }));
    expect((screen.getByLabelText('Floor colour') as HTMLInputElement).value).not.toBe('');
    fireEvent.click(screen.getByRole('button', { name: /Band 1/ }));
    expect(screen.getByLabelText('Gap before band')).toBeDefined();
  });

  it('shows the 3D view of the same hall with the selected section highlighted', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Section “Centre” · centre' }));
    fireEvent.click(screen.getByRole('button', { name: '3D' }));
    expect(screen.getByTestId('preview-3d')).toBeDefined();
    expect(previewProps.mock.calls.at(-1)?.[0].highlightSections).toContain('centre');
    expect(document.querySelector('[data-chk="editor-plan"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '2D' }));
    expect(document.querySelector('[data-chk="editor-plan"]')).not.toBeNull();
  });

  it('the seat type select links to the seat types and prices panel', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Section “Centre” · centre' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit types…' }));
    expect(document.querySelector('tr[data-seat-type="recliner"]')).not.toBeNull();
  });

  it('the close button of the inspector returns to the hall overview', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Section “Centre” · centre' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hall overview' }));
    expect(screen.getByText('126 seats')).toBeDefined();
  });
});
