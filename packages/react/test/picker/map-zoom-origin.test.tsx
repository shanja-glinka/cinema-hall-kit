import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeatPicker } from '../../src/seat-picker/SeatPicker.js';
import { makeLayout } from './fixtures.js';

vi.mock('../../src/seat-view/SeatView.js', () => ({ SeatView: () => <canvas /> }));

vi.mock('../../src/sheet/GlassSheet.js', () => ({
  GlassSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="mobile-sheet">{children}</div> : null,
}));

const A = 'main.r1.s1';

const layout = { ...makeLayout(1, 4), pricing: { tiers: { std: 450 } } };

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
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the map zoom origin follows the seat after the map is scrolled', () => {
  it('measures where the seat is on screen when the preview starts', async () => {
    let seatLeft = 236;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const isSeat =
        this.getAttribute('data-chk') === 'seat' && this.getAttribute('data-key') === A;
      const box = isSeat
        ? { left: seatLeft, top: 390, width: 20, height: 20 }
        : { left: 0, top: 0, width: 600, height: 800 };
      return {
        ...box,
        x: box.left,
        y: box.top,
        right: box.left + box.width,
        bottom: box.top + box.height,
      } as DOMRect;
    });
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.getAttribute('data-chk') === 'map-scroll' ? 1200 : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.getAttribute('data-chk') === 'map-scroll' ? 600 : 0;
    });
    const { container } = render(
      <SeatPicker layout={layout} selection={{ mode: 'multiple' }} occupancy={{ revision: 1 }} />,
    );
    const mapLayer = () => container.querySelector('[data-chk="map-layer"]') as HTMLElement;
    fireEvent.click(screen.getByRole('gridcell', { name: /A1,/ }));
    expect(mapLayer().style.getPropertyValue('--chk-_ox')).toBe('41%');
    // The viewer pans the map: the seat is now further left on screen.
    seatLeft = 140;
    fireEvent.scroll(container.querySelector('[data-chk="map-scroll"]') as HTMLElement);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Preview/ }));
    });
    expect(mapLayer().style.getPropertyValue('--chk-_ox')).toBe('25%');
  });
});
