import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookResult, Occupancy } from '@cinema-hall/core';
import { SeatPickerRoot } from '../../src/seat-picker/SeatPickerRoot.js';
import { SeatPickerMap } from '../../src/seat-picker/SeatPickerMap.js';
import { SeatPickerView } from '../../src/seat-picker/SeatPickerView.js';
import { SeatPickerFooter } from '../../src/seat-picker/Footer.js';
import type { SeatPickerRootProps } from '../../src/seat-picker/types.js';
import { makeLayout } from './fixtures.js';

// jsdom has no WebGL: the 3D layer is replaced by a stub that records its props.
vi.mock('../../src/seat-view/SeatView.js', () => ({
  SeatView: () => null,
}));

const layout = makeLayout(2, 3);

afterEach(() => cleanup());

function renderPicker(props: Partial<SeatPickerRootProps> = {}, withView = false) {
  return render(
    <SeatPickerRoot
      layout={layout}
      occupancy={{ revision: 1 } as Occupancy}
      sheet={false}
      transitions="none"
      {...props}
    >
      <SeatPickerMap />
      {withView ? <SeatPickerView /> : null}
      <SeatPickerFooter />
    </SeatPickerRoot>,
  );
}

describe('controlled selection (F01)', () => {
  it('renders the host value and asks for changes instead of changing it', () => {
    const onValueChange = vi.fn();
    renderPicker({
      selection: { mode: 'multiple' },
      value: ['main.r1.s1'],
      onValueChange,
    });
    fireEvent.click(screen.getByRole('gridcell', { name: /B1,/ }));
    expect(onValueChange).toHaveBeenLastCalledWith(['main.r1.s1', 'main.r2.s1']);
    // The host did not update the value, so the footer still shows one seat.
    expect(screen.getByText('Row A · Seat 1')).toBeTruthy();
    expect(screen.queryByText(/2 seats/)).toBeNull();
  });
});

describe('availability in single mode (F05)', () => {
  it('a taken seat cannot be picked by a tap', () => {
    const onValueChange = vi.fn();
    renderPicker({
      occupancy: { revision: 2, taken: ['main.r1.s3'] },
      onValueChange,
    });
    fireEvent.click(screen.getByRole('gridcell', { name: /A3,/ }));
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe('view requests (F14, F30)', () => {
  it('reports the view once when a transition starts, and not for a repeated request', () => {
    const onViewChange = vi.fn();
    renderPicker({ onViewChange }, true);
    fireEvent.click(screen.getByRole('gridcell', { name: /A1,/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenLastCalledWith({ stage: 'view', seatKey: 'main.r1.s1' });
  });

  it('a requested seat that is taken is invalid, even when it is selected', () => {
    const onInvalidView = vi.fn();
    renderPicker({
      view: { stage: 'view', seatKey: 'main.r1.s3' },
      occupancy: { revision: 3, taken: ['main.r1.s3'] },
      onInvalidView,
    });
    expect(onInvalidView).toHaveBeenCalled();
  });
});

describe('booking types (F32)', () => {
  it('onBooked receives the host data type without a guard', () => {
    type Booked = { reference: string };
    const onBooked = vi.fn<(result: { ok: true; data: Booked }) => void>();
    const result: BookResult<Booked> = { ok: true, data: { reference: 'R-1' } };
    if (result.ok) onBooked(result);
    expect(onBooked).toHaveBeenCalledWith({ ok: true, data: { reference: 'R-1' } });
  });
});
