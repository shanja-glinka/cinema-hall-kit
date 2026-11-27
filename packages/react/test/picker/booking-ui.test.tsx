import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildHallLayout,
  type BookResult,
  type HallConfig,
  type HallLayout,
  type SeatKey,
} from '@cinema-hall/core';
import { SeatMap } from '../../src/seat-map/SeatMap.js';
import { buildMapGeometry } from '../../src/seat-map/geometry.js';
import { SeatPicker } from '../../src/seat-picker/SeatPicker.js';
import { normalizeConfirmResult } from '../../src/seat-picker/booking.js';
import { labels } from '../../src/labels/labels.js';
import { makeLayout } from './fixtures.js';

const ui = vi.hoisted(() => ({ width: 600 }));
vi.mock('../../src/seat-view/SeatView.js', () => ({ SeatView: () => <canvas /> }));
vi.mock('../../src/sheet/GlassSheet.js', () => ({
  GlassSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="mobile-sheet">{children}</div> : null,
}));

const picker = labels.en.picker;
const A = 'main.r1.s1';
const B = 'main.r1.s2';
const C = 'main.r1.s3';

/** Two seat types: the first one grey like the "Classic" type of the sample halls. */
function twoTypeLayout(): HallLayout {
  const layout = makeLayout(2, 3);
  return {
    ...layout,
    seatTypes: {
      std: { label: 'Classic', width: 0.5, depth: 0.55, color: '#5E636B' },
      vip: { label: 'Lounge', width: 0.5, depth: 0.55, color: '#B98A8A' },
    },
    seats: layout.seats.map((seat) =>
      seat.rowIndex === 1 ? { ...seat, seatTypeId: 'vip', priceTier: 'vip' } : seat,
    ),
  } as HallLayout;
}

beforeEach(() => {
  ui.width = 600;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as WebGLRenderingContext);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const width = this.dataset.chk === 'root' ? ui.width : 600;
    return {
      width,
      height: 800,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: 800,
    } as DOMRect;
  });
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

function renderMap(overrides: Partial<Parameters<typeof SeatMap>[0]> = {}) {
  const props = {
    layout: twoTypeLayout(),
    status: (key: SeatKey) => (key === C ? 'taken' : key === 'main.r2.s3' ? 'held' : 'available'),
    priceOf: (key: SeatKey) => (key.startsWith('main.r2') ? (key.endsWith('s1') ? 700 : 650) : 450),
    formatPrice: (price: number) => `${price} ¤`,
    selected: [] as SeatKey[],
    focusKey: null,
    labels: picker,
    onFocusSeat: vi.fn(),
    onActivate: vi.fn(),
    ...overrides,
  } as Parameters<typeof SeatMap>[0];
  return render(<SeatMap {...props} />);
}

const seatEl = (container: HTMLElement, key: string) =>
  container.querySelector(`[data-chk="seat"][data-key="${key}"]`) as SVGGElement;

describe('seat states differ by shape, not only by colour', () => {
  it('fills available seats with their type colour (the first type too) and crosses out taken seats', () => {
    const { container } = renderMap();
    const free = seatEl(container, A);
    expect(free.style.getPropertyValue('--chk-_type')).toBe('#5E636B');
    expect(free.hasAttribute('data-chk-glyph')).toBe(true);
    expect(free.querySelector('[data-chk="seat-mark"]')).toBeNull();
    const taken = seatEl(container, C);
    expect(taken.querySelector('[data-chk="seat-mark"]')?.getAttribute('d')).toMatch(
      /M .* L .* M .* L/,
    );
    const held = seatEl(container, 'main.r2.s3');
    expect(held.querySelector('[data-chk="seat-mark"]')).not.toBeNull();
    expect(held.querySelector('[data-chk="seat-mark"]')?.getAttribute('d')).not.toBe(
      taken.querySelector('[data-chk="seat-mark"]')?.getAttribute('d'),
    );
  });

  it('the CSS fills every seat type from its colour and draws taken, held and blocked seats as outlines', () => {
    const css = readFileSync('src/seat-map/seat-map.css', 'utf8');
    // No neutral special case for the first seat type any more.
    expect(css).not.toContain("data-seat-type-index='0'");
    const rule = (selector: string) => {
      const start = css.indexOf(selector);
      expect(start).toBeGreaterThan(-1);
      return css.slice(start, css.indexOf('}', start));
    };
    expect(rule(':where([data-chk-glyph] rect)')).toContain('var(--chk-_type');
    for (const state of ['taken', 'held', 'blocked']) {
      const body = rule(`:where([data-chk-glyph][data-status='${state}'] rect)`);
      expect(body).toContain('stroke: var(--chk-seat-');
    }
    expect(rule(":where([data-chk-glyph][data-status='taken'] rect)")).toContain(
      'fill: transparent',
    );
    expect(rule(":where([data-chk-glyph][data-status='held'] rect)")).toContain('stroke-dasharray');
    expect(css).not.toMatch(/gradient\(/);
  });

  it('the legend lists the seat types with their prices and the seat states', () => {
    const { container } = renderMap();
    const legend = container.querySelector('[data-chk="legend"]') as HTMLElement;
    const types = legend.querySelector('[data-group="types"]') as HTMLElement;
    expect(types.textContent).toContain('Available seats');
    expect(within(types).getByText('Classic · 450 ¤')).toBeTruthy();
    expect(within(types).getByText('Lounge · from 650 ¤')).toBeTruthy();
    const states = legend.querySelector('[data-group="status"]') as HTMLElement;
    expect([...states.querySelectorAll('li')].map((li) => li.getAttribute('data-status'))).toEqual([
      'selected',
      'held',
      'taken',
    ]);
    // Every swatch is the same glyph as the seats.
    expect(states.querySelector('li[data-status="taken"] [data-chk="seat-mark"]')).not.toBeNull();
    expect(types.querySelector('[data-swatch] [data-chk-glyph]')).not.toBeNull();
  });

  it('lists "Your seats" and "Unavailable" only when the map has such seats', () => {
    const { container } = renderMap({
      isMine: (key) => key === A,
      status: (key) => (key === A ? 'held' : key === B ? 'blocked' : 'available'),
    });
    const states = container.querySelector('[data-group="status"]') as HTMLElement;
    expect([...states.querySelectorAll('li')].map((li) => li.getAttribute('data-status'))).toEqual([
      'selected',
      'mine',
      'held',
      'taken',
      'blocked',
    ]);
    expect(states.textContent).toContain('Your seats');
  });

  it('keeps legend and state colours readable: text on the foreground colour, state lines at 3:1 or more', () => {
    const map = readFileSync('src/seat-map/seat-map.css', 'utf8');
    const legendText = map.slice(map.indexOf(":where([data-chk='legend'] li) {\n    color"));
    expect(
      legendText.startsWith(":where([data-chk='legend'] li) {\n    color: var(--chk-fg);"),
    ).toBe(true);
    const base = readFileSync('src/theme/base.css', 'utf8');
    const schemes = [
      { bg: '#0e0e12', fg: '#f5f4f1', held: ['#b48cff', 75] as const },
      { bg: '#ffffff', fg: '#121216', held: ['#7a4fd6', 85] as const },
    ];
    expect(base).toContain(
      '--chk-seat-taken: color-mix(in oklab, var(--chk-bg), var(--chk-fg) 45%);',
    );
    expect(base).toContain('--chk-seat-held: color-mix(in oklab, #b48cff 75%, var(--chk-bg));');
    expect(base).toContain('--chk-seat-held: color-mix(in oklab, #7a4fd6 85%, var(--chk-bg));');
    for (const scheme of schemes) {
      const taken = mixOklab(scheme.fg, scheme.bg, 0.45);
      const held = mixOklab(scheme.held[0], scheme.bg, scheme.held[1] / 100);
      expect(contrast(taken, hex(scheme.bg))).toBeGreaterThanOrEqual(3);
      expect(contrast(held, hex(scheme.bg))).toBeGreaterThanOrEqual(3);
      expect(contrast(hex(scheme.fg), hex(scheme.bg))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('aisles and section boundaries follow the layout geometry', () => {
  const config = (gap?: number) =>
    ({
      schemaVersion: 1,
      name: 'Balcony test',
      hall: { width: 14, depth: 12, height: 6 },
      screen: { width: 10, height: 4, elevation: 1 },
      seatTypes: { balcony: { label: 'Balcony', width: 0.55, depth: 0.6, color: '#6e9fba' } },
      layout: {
        firstRowDistance: 4,
        bands: [
          {
            id: 'balcony',
            defaults: { rows: 1, rowSpacing: 1.1, seatPitch: 0.6, seatType: 'balcony' },
            sections: [
              { id: 'balcony-main', seatsPerRow: 14 },
              {
                id: 'balcony-box',
                seatsPerRow: 2,
                ...(gap !== undefined ? { gapBefore: gap } : {}),
              },
            ],
          },
        ],
      },
      pricing: { tiers: { balcony: 380 } },
    }) as unknown as HallConfig;
  const xs = (layout: HallLayout) =>
    buildMapGeometry(layout)
      .seats.slice()
      .sort((p, q) => p.cx - q.cx);

  it('draws the aisle between two sections of one row as empty space of the configured width', () => {
    const layout = buildHallLayout(config(1.2));
    const cells = xs(layout);
    const last = cells.findLast((cell) => cell.sectionId === 'balcony-main')!;
    const first = cells.find((cell) => cell.sectionId === 'balcony-box')!;
    // centre-to-centre distance = one seat pitch + the aisle, in centimetres
    expect(Math.round(first.cx - last.cx)).toBe(Math.round((0.6 + 1.2) * 100));
    expect(buildMapGeometry(layout).dividers).toHaveLength(0);
  });

  it('marks the boundary of sections that touch (no aisle in the layout) with a divider', () => {
    const layout = buildHallLayout(config());
    const geometry = buildMapGeometry(layout);
    expect(geometry.dividers).toHaveLength(1);
    const cells = xs(layout);
    const last = cells.findLast((cell) => cell.sectionId === 'balcony-main')!;
    const first = cells.find((cell) => cell.sectionId === 'balcony-box')!;
    expect(geometry.dividers[0]!.x).toBeGreaterThan(last.cx);
    expect(geometry.dividers[0]!.x).toBeLessThan(first.cx);
    const { container } = render(
      <SeatMap
        layout={layout}
        status={() => 'available'}
        selected={[]}
        focusKey={null}
        labels={picker}
        onFocusSeat={vi.fn()}
        onActivate={vi.fn()}
      />,
    );
    expect(container.querySelectorAll('[data-chk="section-divider"]')).toHaveLength(1);
  });
});

describe('touch targets on narrow screens', () => {
  it('gives each seat a tap area as large as its footprint', () => {
    const { container } = renderMap();
    const seat = seatEl(container, A);
    const rect = seat.querySelector('rect') as SVGRectElement;
    const hit = seat.querySelector('[data-chk="seat-hit"]') as SVGPathElement;
    const width = Number(rect.getAttribute('width'));
    const hitWidth = Number(/h ([\d.]+)/.exec(hit.getAttribute('d') ?? '')?.[1]);
    expect(hitWidth).toBeGreaterThan(width);
    expect(hitWidth).toBeCloseTo(50, 5);
  });

  it('sets the smallest map width that keeps seats at the tap size, and 0 when turned off', () => {
    const layout = twoTypeLayout();
    const geometry = buildMapGeometry(layout);
    const { container, unmount } = renderMap({ layout });
    const scroll = container.querySelector('[data-chk="map-scroll"]') as HTMLElement;
    const expected = Math.round((geometry.viewBox.width * 32) / geometry.minSeatWidth);
    expect(scroll.style.getPropertyValue('--chk-_map-min-width')).toBe(`${expected}px`);
    expect(container.querySelector('[data-chk="legend"]')?.parentElement).toBe(
      container.querySelector('[data-chk="map-wrapper"]'),
    );
    unmount();
    const off = renderMap({ layout, minSeatSize: 0 });
    expect(
      (
        off.container.querySelector('[data-chk="map-scroll"]') as HTMLElement
      ).style.getPropertyValue('--chk-_map-min-width'),
    ).toBe('0px');
  });

  it('applies the minimum width in the mobile picker and on touch screens, and keeps the legend outside the scroller', () => {
    const pickerCss = readFileSync('src/seat-picker/seat-picker.css', 'utf8');
    expect(pickerCss).toContain(
      ":where([data-chk='root']:not([data-chk-desktop]) [data-chk='map']) {\n    min-width: var(--chk-_map-min-width, 0px);",
    );
    expect(pickerCss).toContain(
      ":where([data-chk='root']:not([data-chk-desktop]) [data-chk='legend']) {\n    flex: 0 0 auto;",
    );
    const mapCss = readFileSync('src/seat-map/seat-map.css', 'utf8');
    expect(mapCss).toMatch(
      /@media \(pointer: coarse\) \{\s*:where\(\[data-chk='map'\]\) \{\s*min-width: var\(--chk-_map-min-width/,
    );
  });
});

describe("the viewer's own holds look like theirs", () => {
  it('draws an own hold that is not selected as "Your seats", and another viewer\'s hold as on hold', () => {
    const layout = { ...makeLayout(1, 3), pricing: { tiers: { std: 450 } } };
    const { container } = render(
      <SeatPicker
        layout={layout}
        transitions="none"
        occupancy={{ revision: 2, held: [{ key: A, mine: true }, { key: B }] }}
      />,
    );
    const mine = seatEl(container, A);
    expect(mine.hasAttribute('data-mine')).toBe(true);
    expect(mine.getAttribute('aria-label')).toContain('Your seats');
    const other = seatEl(container, B);
    expect(other.hasAttribute('data-mine')).toBe(false);
    expect(other.getAttribute('aria-label')).toContain('On hold');
    expect(container.querySelector('[data-group="status"] li[data-status="mine"]')).not.toBeNull();
  });
});

describe('reservation wording and the optional purchase step', () => {
  const layout = { ...makeLayout(1, 3), pricing: { tiers: { std: 450 } } };
  const expiresAt = () => new Date(Date.now() + 600_000).toISOString();
  const reserve = async (): Promise<BookResult<{ holdId: string }>> => ({
    ok: true,
    data: { holdId: 'H-1' },
    hold: { expiresAt: expiresAt() },
  });
  const book = async () => {
    fireEvent.click(screen.getByRole('gridcell', { name: /A1,/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    });
  };

  it('without onConfirm: a disabled "Seats reserved" and the countdown, without a purchase hint', async () => {
    render(
      <SeatPicker
        layout={layout}
        transitions="none"
        occupancy={{ revision: 1 }}
        onBook={reserve}
      />,
    );
    await book();
    expect(
      (screen.getByRole('button', { name: 'Seats reserved' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    const hold = screen.getByRole('status');
    // A reservation-only picker has no purchase step to point at.
    expect(hold.textContent).toMatch(/^Seats reserved for (10:00|09:5\d)$/);
    expect(screen.queryByText(/Booked|Held for/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Confirm purchase/ })).toBeNull();
  });

  it('with onConfirm: Confirm purchase calls it with the reserved seats and the booking data, then shows the ticket', async () => {
    const onConfirm = vi.fn(async () => ({ ok: true as const, ticket: 'T-42' }));
    render(
      <SeatPicker
        layout={layout}
        transitions="none"
        occupancy={{ revision: 1 }}
        onBook={reserve}
        onConfirm={onConfirm}
      />,
    );
    await book();
    const confirm = screen.getByRole('button', { name: /^Confirm purchase · 450\.00\s¤$/ });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      fireEvent.click(confirm);
    });
    expect(onConfirm).toHaveBeenCalledWith(
      [A],
      expect.objectContaining({ booking: { holdId: 'H-1' }, holdExpiresAt: expect.any(String) }),
    );
    expect(screen.getByRole('status').textContent).toBe('Purchased · ticket № T-42');
    expect((screen.getByRole('button', { name: 'Purchased' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('keeps bought seats selected when the next snapshot shows them as taken', async () => {
    const onConfirm = vi.fn(async () => ({ ok: true as const }));
    const onSelectionLost = vi.fn();
    const view = render(
      <SeatPicker
        layout={layout}
        transitions="none"
        occupancy={{ revision: 1 }}
        onBook={reserve}
        onConfirm={onConfirm}
        onSelectionLost={onSelectionLost}
      />,
    );
    await book();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }));
    });
    view.rerender(
      <SeatPicker
        layout={layout}
        transitions="none"
        occupancy={{ revision: 3, taken: [A] }}
        onBook={reserve}
        onConfirm={onConfirm}
        onSelectionLost={onSelectionLost}
      />,
    );
    expect(onSelectionLost).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('Purchase complete');
    expect(seatEl(view.container, A).hasAttribute('data-selected')).toBe(true);
  });

  it('shows a retryable error when onConfirm fails, and the expiry notice when the hold ran out', async () => {
    const onConfirm = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ ok: false, reason: 'expired' });
    render(
      <SeatPicker
        layout={layout}
        transitions="none"
        occupancy={{ revision: 1 }}
        onBook={reserve}
        onConfirm={onConfirm}
      />,
    );
    await book();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm purchase/ }));
    });
    expect(screen.getByRole('alert').textContent).toBe(
      'The purchase could not be completed. Please try again.',
    );
    const again = screen.getByRole('button', { name: /Confirm purchase/ }) as HTMLButtonElement;
    expect(again.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(again);
    });
    expect(screen.getByRole('status').textContent).toBe(
      'Your reservation has expired. Please choose your seats again.',
    );
    expect(
      (screen.getByRole('button', { name: /Confirm purchase/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('normalizes what onConfirm returns', () => {
    expect(normalizeConfirmResult({ ok: true, ticket: 17 })).toEqual({ ok: true, ticket: '17' });
    expect(normalizeConfirmResult({ ok: true })).toEqual({ ok: true });
    expect(normalizeConfirmResult({ ok: false, reason: 'expired' })).toEqual({
      ok: false,
      reason: 'expired',
    });
    expect(normalizeConfirmResult('yes')).toEqual({ ok: false, reason: 'error' });
  });
});

/* ---- colour helpers: CSS color-mix(in oklab) and WCAG contrast ---- */
function hex(value: string): number[] {
  const h = value.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function toOklab(rgb: number[]): number[] {
  const [r, g, b] = rgb.map(toLinear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function fromOklab([L, a, b]: number[]): number[] {
  const l = (L! + 0.3963377774 * a! + 0.2158037573 * b!) ** 3;
  const m = (L! - 0.1055613458 * a! - 0.0638541728 * b!) ** 3;
  const s = (L! - 0.0894841775 * a! - 1.291485548 * b!) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => Math.min(1, Math.max(0, toGamma(c))));
}
/** color-mix(in oklab, first share, second). */
function mixOklab(first: string, second: string, share: number): number[] {
  const p = toOklab(hex(first));
  const q = toOklab(hex(second));
  return fromOklab(p.map((v, i) => v * share + q[i]! * (1 - share)));
}
function contrast(x: number[], y: number[]): number {
  const lum = (rgb: number[]) =>
    rgb.map(toLinear).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0);
  const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
