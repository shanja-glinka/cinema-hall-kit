import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, type ComponentProps } from 'react';
import type { BookContext, BookResult } from '@cinema-hall/core';
import { SeatPicker } from '../../src/seat-picker/SeatPicker.js';
import { SeatPickerRoot } from '../../src/seat-picker/SeatPickerRoot.js';
import { SeatPickerMap } from '../../src/seat-picker/SeatPickerMap.js';
import { SeatPickerView } from '../../src/seat-picker/SeatPickerView.js';
import { SeatPickerSheet } from '../../src/seat-picker/SeatPickerSheet.js';
import { SeatPickerFooter } from '../../src/seat-picker/Footer.js';
import type { SeatViewProps } from '../../src/seat-view/SeatView.js';
import { makeLayout } from './fixtures.js';

const ui = vi.hoisted(() => ({
  width: 600,
  mounts: 0,
  camera: null as SeatViewProps | null,
  observers: new Map<Element, () => void>(),
  sheetCalls: 0,
}));
vi.mock('../../src/seat-view/SeatView.js', () => ({
  SeatView: (props: SeatViewProps) => {
    ui.camera = props;
    useEffect(() => {
      ui.mounts++;
    }, []);
    return <canvas data-testid="camera" data-seat={props.seatKey ?? 'overview'} />;
  },
}));
vi.mock('../../src/sheet/GlassSheet.js', () => ({
  GlassSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => {
    ui.sheetCalls++;
    return open ? <div data-testid="mobile-sheet">{children}</div> : null;
  },
}));
const A = 'main.r1.s1',
  B = 'main.r1.s2';
const layout = { ...makeLayout(1, 3), pricing: { tiers: { std: 450.25 } } };
const occupancy = { revision: 1 };
const defaults = { layout, occupancy, transitions: 'none' as const };

beforeEach(() => {
  ui.width = 600;
  ui.mounts = 0;
  ui.camera = null;
  ui.observers.clear();
  ui.sheetCalls = 0;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as WebGLRenderingContext);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return {
      width: this.dataset.chk === 'root' ? ui.width : 600,
      height: 800,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: ui.width,
      bottom: 800,
      toJSON: () => ({}),
    };
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      callback: () => void;
      constructor(callback: () => void) {
        this.callback = callback;
      }
      observe(element: Element) {
        ui.observers.set(element, this.callback);
      }
      disconnect() {
        for (const [element, cb] of ui.observers)
          if (cb === this.callback) ui.observers.delete(element);
      }
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function resize(width: number) {
  act(() => {
    ui.width = width;
    for (const callback of ui.observers.values()) callback();
  });
}
function pick(name = 'A1,') {
  fireEvent.click(screen.getByRole('gridcell', { name: new RegExp(name) }));
}

describe('separate preview and booking actions (R1)', () => {
  it('disables both map actions until selection, then previews without booking', () => {
    const onBook = vi.fn();
    render(<SeatPicker {...defaults} onBook={onBook} />);
    expect((screen.getByRole('button', { name: 'Preview' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    pick();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByTestId('mobile-sheet')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Book · 450.25/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change seat' })).toBeTruthy();
    expect(onBook).not.toHaveBeenCalled();
  });
  it('Continue books directly with the entire canonical selection, without entering preview', async () => {
    const onBook = vi.fn(async (_keys: string[], _ctx: BookContext): Promise<BookResult> => ({
      ok: false,
      reason: 'error',
    }));
    const onViewChange = vi.fn();
    render(
      <SeatPicker
        {...defaults}
        selection={{ mode: 'multiple' }}
        onBook={onBook}
        onViewChange={onViewChange}
      />,
    );
    pick('A2,');
    pick();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Continue · 900.50/ }));
    });
    expect(onBook).toHaveBeenCalledWith(
      [A, B],
      expect.objectContaining({
        prices: [
          { key: A, price: 450.25 },
          { key: B, price: 450.25 },
        ],
      }),
    );
    expect(onViewChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId('mobile-sheet')).toBeNull();
  });
  it('still opens the view on selection when openViewOn is select', () => {
    render(<SeatPicker {...defaults} selection={{ mode: 'single', openViewOn: 'select' }} />);
    pick();
    expect(screen.getByTestId('mobile-sheet')).toBeTruthy();
  });
});

describe('root-responsive live desktop layout (R2)', () => {
  it('mounts overview at 1024, flies on map focus/click, and keeps one view through Preview, Esc and Back', () => {
    ui.width = 1024;
    const onTransition = vi.fn();
    const { container } = render(
      <SeatPicker {...defaults} transitions="cinematic" onTransition={onTransition} />,
    );
    const root = container.querySelector('[data-chk="root"]') as HTMLElement;
    expect(root.hasAttribute('data-chk-desktop')).toBe(true);
    expect(screen.getByTestId('camera').getAttribute('data-seat')).toBe('overview');
    expect(screen.queryByTestId('mobile-sheet')).toBeNull();
    expect(container.querySelector('[data-chk="legend"]')).not.toBeNull();
    expect(container.querySelector('[data-chk="details-panel"]')).not.toBeNull();
    pick();
    expect(screen.getByTestId('camera').getAttribute('data-seat')).toBe(A);
    fireEvent.focus(screen.getByRole('gridcell', { name: /A2,/ }));
    expect(screen.getByTestId('camera').getAttribute('data-seat')).toBe(B);
    expect(screen.getByText('Row A, Seat 2')).toBeTruthy();
    const map = container.querySelector('[data-chk="map-layer"]') as HTMLElement;
    expect(map.style.getPropertyValue('--chk-_scale')).toBe('1');
    expect(map.style.getPropertyValue('--chk-_opacity')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(root.dataset.stage).toBe('view');
    expect(screen.getByTestId('camera').getAttribute('data-seat')).toBe(B);
    fireEvent.keyDown(root, { key: 'Escape' });
    expect(root.dataset.stage).toBe('map');
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(root.dataset.stage).toBe('map');
    expect(map.style.visibility).toBe('');
    expect(ui.mounts).toBe(1);
    expect(onTransition).not.toHaveBeenCalled();
    expect(ui.camera?.flight && ui.camera.flight.lowResScale).toBe(1);
  });
  it('never flies the live camera to a taken seat that merely received focus', () => {
    ui.width = 1100;
    render(<SeatPicker {...defaults} occupancy={{ revision: 1, taken: [B] }} />);
    pick();
    expect(screen.getByTestId('camera').getAttribute('data-seat')).toBe(A);
    fireEvent.focus(screen.getByRole('gridcell', { name: /A2,/ }));
    expect(screen.getByTestId('camera').getAttribute('data-seat')).toBe(A);
  });
  it('switches at root width rather than viewport width, in composed Root parts as well', () => {
    const { container } = render(
      <SeatPickerRoot {...defaults}>
        <SeatPickerMap />
        <SeatPickerView />
        <SeatPickerSheet />
        <SeatPickerFooter />
      </SeatPickerRoot>,
    );
    expect(screen.queryByTestId('camera')).toBeNull();
    resize(1100);
    expect(screen.getByTestId('camera')).toBeTruthy();
    expect(container.querySelector('[data-chk="details-panel"]')).not.toBeNull();
    resize(1023);
    expect(container.querySelector('[data-chk="details-panel"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeTruthy();
    expect(container.querySelector('[data-chk="root"]')?.hasAttribute('data-chk-desktop')).toBe(
      false,
    );
  });
  it('keeps details usable when the mobile sheet is disabled and books from the static panel', async () => {
    ui.width = 1200;
    const onBook = vi.fn(async (): Promise<BookResult> => ({ ok: true, data: null, revision: 2 }));
    const { container } = render(<SeatPicker {...defaults} sheet={false} onBook={onBook} />);
    pick();
    const panel = container.querySelector('[data-chk="details-panel"]') as HTMLElement;
    expect(within(panel).getByText('Row A, Seat 1')).toBeTruthy();
    await act(async () =>
      fireEvent.click(within(panel).getByRole('button', { name: /Continue ·/ })),
    );
    expect(onBook).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('mobile-sheet')).toBeNull();
  });
});

describe('unit prices throughout the picker', () => {
  it('merges hall tiers with session overrides, retains zero prices, and uses the host formatter for map, footer, sheet and booking', async () => {
    const special = {
      ...layout,
      seats: layout.seats.map((seat) => (seat.key === B ? { ...seat, priceTier: 'vip' } : seat)),
      pricing: { tiers: { std: 450.25, vip: 650.5 } },
    };
    const formatPrice = vi.fn((price: number) => `units(${price.toFixed(2)})`);
    const onBook = vi.fn(async (_keys: string[], _ctx: BookContext): Promise<BookResult> => ({
      ok: false,
      reason: 'error',
    }));
    const props: ComponentProps<typeof SeatPicker> = {
      ...defaults,
      layout: special,
      pricing: { tiers: { std: 500.5 }, seats: { [A]: 0 } },
      formatPrice,
      onBook,
    };
    render(<SeatPicker {...props} selection={{ mode: 'multiple' }} />);
    expect(screen.getByRole('gridcell', { name: /A1,.*units\(0.00\)/ })).toBeTruthy();
    expect(screen.getByRole('gridcell', { name: /A2,.*units\(650.50\)/ })).toBeTruthy();
    expect(screen.getByRole('gridcell', { name: /A3,.*units\(500.50\)/ })).toBeTruthy();
    pick();
    pick('A2,');
    expect(screen.getByRole('button', { name: /Continue · units\(650.50\)/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByText('Standard · units(650.50)')).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: /Book · units\(650.50\)/ })),
    );
    expect(onBook).toHaveBeenCalledWith(
      [A, B],
      expect.objectContaining({
        prices: [
          { key: A, price: 0 },
          { key: B, price: 650.5 },
        ],
      }),
    );
  });
  it('uses the configured neutral sign without currency text', () => {
    render(
      <SeatPicker
        {...defaults}
        locale="de-DE"
        labels={{ picker: { priceSign: 'units' } }}
        defaultValue={[A]}
      />,
    );
    expect(screen.getByRole('button', { name: /Continue · 450,25\sunits/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeTruthy();
  });
});
