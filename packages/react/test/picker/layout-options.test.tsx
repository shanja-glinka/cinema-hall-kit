import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONSTRAINTS, parseHallConfig, type HallLayout } from '@cinema-hall/core';
import { readFileSync } from 'node:fs';
import { SeatPickerRoot } from '../../src/seat-picker/SeatPickerRoot.js';
import { useSeatPicker } from '../../src/seat-picker/use-seat-picker.js';

vi.mock('../../src/seat-view/SeatView.js', () => ({ SeatView: () => <canvas /> }));

vi.mock('../../src/sheet/GlassSheet.js', () => ({
  GlassSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="mobile-sheet">{children}</div> : null,
}));

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

describe('layoutOptions builds the picker layout like the server', () => {
  const parsed = parseHallConfig(
    readFileSync('../core/test/fixtures/meridian-hall-3.yaml', 'utf8'),
  );
  if (!parsed.ok) throw new Error('fixture');
  const config = {
    ...parsed.config,
    constraints: { ...parsed.config.constraints, balconySlabThickness: 0.9 },
  };
  let seen: HallLayout | null = null;
  function Probe() {
    seen = useSeatPicker().layout;
    return null;
  }

  it('without it the hall file sizes are used, as before', () => {
    render(
      <SeatPickerRoot
        config={config}
        transitions="none"
        onBook={async () => ({ ok: true, data: null })}
      >
        <Probe />
      </SeatPickerRoot>,
    );
    expect(seen!.balconySlabThickness).toBe(0.9);
  });

  it('enforce: true draws the balcony with the host sizes, not the hall file overrides', () => {
    const first: HallLayout[] = [];
    function Keep() {
      first.push(useSeatPicker().layout);
      return null;
    }
    const ui = () => (
      <SeatPickerRoot
        config={config}
        layoutOptions={{ enforce: true }}
        transitions="none"
        onBook={async () => ({ ok: true, data: null })}
      >
        <Keep />
      </SeatPickerRoot>
    );
    const view = render(ui());
    expect(first.at(-1)!.balconySlabThickness).toBe(DEFAULT_CONSTRAINTS.balconySlabThickness);
    // A new but equal options object does not rebuild the layout.
    view.rerender(ui());
    expect(first.at(-1)).toBe(first[0]);
  });
});
