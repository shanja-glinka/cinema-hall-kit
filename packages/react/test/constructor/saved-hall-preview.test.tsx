import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HallConstructor } from '../../src/constructor/HallConstructor.js';
import { loadFixture } from './support.js';

vi.mock('../../src/seat-view/HallPreview.js', () => ({ HallPreview: () => null }));
afterEach(cleanup);
it('draws booked seats removed by the edit as ghost dots at their saved positions', async () => {
  render(
    <HallConstructor
      defaultValue={loadFixture()}
      onSave={async () => ({
        ok: false,
        reason: 'seats_in_use',
        keys: ['centre.r1.s8', 'centre.r1.s1'],
      })}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Section “Centre” · centre' }));
  const seats = screen.getByLabelText('Seats per row');
  fireEvent.change(seats, { target: { value: '7' } });
  fireEvent.blur(seats);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(document.querySelector('[data-key="centre.r1.s8"]')?.hasAttribute('data-ghost')).toBe(
      true,
    ),
  );
  expect(document.querySelector('[data-key="centre.r1.s1"]')?.getAttribute('data-status')).toBe(
    'in-use',
  );
  expect(screen.getByText('Booked seats: centre.r1.s8, centre.r1.s1')).toBeDefined();
});
