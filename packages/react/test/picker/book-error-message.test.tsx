import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookResult } from '@cinema-hall/core';
import { SeatPicker } from '../../src/seat-picker/SeatPicker.js';
import { messageText } from '../../src/seat-picker/Footer.js';
import { normalizeBookResult } from '../../src/seat-picker/booking.js';
import { initialPickerState, pickerReducer } from '../../src/seat-picker/store.js';
import { formatLabel, labels as allLabels } from '../../src/labels/labels.js';
import { makeLayout } from './fixtures.js';

vi.mock('../../src/seat-view/SeatView.js', () => ({ SeatView: () => <canvas /> }));
vi.mock('../../src/sheet/GlassSheet.js', () => ({
  GlassSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="mobile-sheet">{children}</div> : null,
}));

const A = 'main.r1.s1';
const PICKER = allLabels.en.picker;
const GENERIC = formatLabel(PICKER.error);

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as WebGLRenderingContext);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 600,
    height: 800,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 600,
    bottom: 800,
  } as DOMRect);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const layout = { ...makeLayout(1, 4), pricing: { tiers: { std: 450 } } };

async function book(result: () => Promise<BookResult>) {
  const onBook = vi.fn(result);
  render(
    <SeatPicker
      layout={layout}
      transitions="none"
      selection={{ mode: 'multiple' }}
      occupancy={{ revision: 1 }}
      onBook={onBook}
    />,
  );
  fireEvent.click(screen.getByRole('gridcell', { name: /A1,/ }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
  });
  return onBook;
}

describe('booking refusal messages', () => {
  it("shows the host's explanation for a refused booking and keeps the selection", async () => {
    const onBook = await book(async () => ({
      ok: false,
      reason: 'error',
      message: 'Deselect the seats already reserved for you first.',
    }));
    expect(onBook).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Deselect the seats already reserved for you first.')).toBeDefined();
    expect(screen.queryByText(GENERIC)).toBeNull();
    // The seat stays selected and can be booked again.
    expect(screen.getByRole('gridcell', { name: /A1,/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: /Continue/ })).toBeDefined();
  });

  it('falls back to the generic text without a message, with a blank one, or after a throw', async () => {
    await book(async () => ({ ok: false, reason: 'error' }));
    expect(screen.getByText(GENERIC)).toBeDefined();
    cleanup();
    await book(async () => ({ ok: false, reason: 'error', message: '   ' }));
    expect(screen.getByText(GENERIC)).toBeDefined();
    cleanup();
    await book(async () => {
      throw new Error('internal: database down');
    });
    expect(screen.getByText(GENERIC)).toBeDefined();
    expect(screen.queryByText(/database down/)).toBeNull();
  });

  it('keeps the trimmed message through normalization and the reducer', () => {
    expect(normalizeBookResult({ ok: false, reason: 'error', message: 'Try later.' })).toEqual({
      ok: false,
      reason: 'error',
      message: 'Try later.',
    });
    const withText = pickerReducer(initialPickerState(), {
      type: 'bookResult',
      result: { ok: false, reason: 'error', message: '  Try later. ' },
      keys: [A],
    });
    expect(withText.status).toBe('error');
    expect(withText.message).toEqual({ kind: 'error', text: 'Try later.' });
    const blank = pickerReducer(initialPickerState(), {
      type: 'bookResult',
      result: { ok: false, reason: 'error', message: ' ' },
      keys: [A],
    });
    expect(blank.message).toEqual({ kind: 'error' });
    expect(messageText({ kind: 'error', text: 'Try later.' }, (key) => key, PICKER)).toBe(
      'Try later.',
    );
    expect(messageText({ kind: 'error' }, (key) => key, PICKER)).toBe(GENERIC);
  });
});
