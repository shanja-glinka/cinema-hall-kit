import { readFileSync } from 'node:fs';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import { GlassSheet } from '../../src/sheet/GlassSheet.js';
import { SeatPickerRoot } from '../../src/seat-picker/SeatPickerRoot.js';
import { SeatPickerMap } from '../../src/seat-picker/SeatPickerMap.js';
import { SeatPickerView } from '../../src/seat-picker/SeatPickerView.js';
import { SeatPickerSheet } from '../../src/seat-picker/SeatPickerSheet.js';
import type { SeatPickerRootProps } from '../../src/seat-picker/types.js';
import { makeLayout } from './fixtures.js';

const stub = vi.hoisted(() => ({
  sheetProps: [] as Record<string, unknown>[],
  resize: null as (() => void) | null,
  compact: 176,
  snapTo: vi.fn(),
  visiblePx: 200,
  snapPoints: [0, 200, 1],
}));
vi.mock('react-modal-sheet', async () => {
  const { createElement } = await import('react');
  const { motionValue } = await import('motion/react');
  const yInverted = motionValue(200);
  const Part = ({ children, ref, ...props }: ComponentProps<'div'>) =>
    createElement('div', { ...props, ref }, children);
  const Sheet = Object.assign(
    (props: Record<string, unknown> & { children: ReactNode }) => {
      stub.sheetProps.push(props);
      stub.snapPoints = props.snapPoints as number[];
      return createPortal(
        createElement('div', { className: 'react-modal-sheet-root' }, props.children),
        props.mountPoint as Element,
      );
    },
    {
      Container: Part,
      Header: Part,
      Content: Part,
      useContext: () => ({ height: 600, yInverted, snapTo: stub.snapTo }),
    },
  );
  return { Sheet };
});
vi.mock('../../src/seat-view/SeatView.js', () => ({ SeatView: () => null }));

const A = 'main.r1.s1';
const B = 'main.r1.s2';
const layout = makeLayout(1, 3);
const pricing = { tiers: { std: 1250 } };

function tree(props: Partial<SeatPickerRootProps> = {}) {
  return (
    <SeatPickerRoot
      layout={layout}
      pricing={pricing}
      formatPrice={(price) => `${price.toFixed(2)} u`}
      occupancy={{ revision: 1 }}
      transitions="none"
      defaultView={{ stage: 'view', seatKey: B }}
      {...props}
    >
      <SeatPickerMap />
      <SeatPickerView />
      <SeatPickerSheet />
    </SeatPickerRoot>
  );
}
beforeEach(() => {
  stub.sheetProps.length = 0;
  stub.compact = 176;
  stub.resize = null;
  stub.snapTo.mockReset();
  stub.snapTo.mockImplementation((index: number) => {
    stub.visiblePx = stub.snapPoints[index]!;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.chk === 'sheet-compact' ? stub.compact : 24;
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        stub.resize = callback;
      }
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

describe('focused sheet and deep-link composition (A2, A3)', () => {
  it.each(['single', 'multiple'] as const)(
    'shows the focused seat, price, minimap, metrics and actions in %s mode',
    (mode) => {
      const onValueChange = vi.fn();
      const { container } = render(tree({ selection: { mode }, onValueChange }));
      expect(onValueChange).toHaveBeenCalledWith([B]);
      const sheet = container.querySelector('[data-chk="sheet"]') as HTMLElement;
      expect(within(sheet).getByText('Row A, Seat 2')).toBeTruthy();
      expect(within(sheet).getByText(/Standard ·/).textContent).toContain('1250.00 u');
      expect(within(sheet).getByRole('button', { name: /Book ·.*1250\.00 u/ })).toBeTruthy();
      expect(within(sheet).getByRole('button', { name: 'Change seat' })).toBeTruthy();
      expect(sheet.querySelectorAll('[data-chk="metric-value"]')).toHaveLength(3);
      expect(sheet.querySelector('[data-chk="minimap-current"]')).not.toBeNull();
      expect(sheet.querySelector('[data-chk="chip"]')).not.toBeNull();
      if (mode === 'multiple')
        expect(sheet.querySelector('[data-chk="sheet-selection"]')?.textContent).toMatch(
          /1 seat.*Total.*1250\.00 u/,
        );
    },
  );

  it('restores the visible map when a loaded deep link becomes taken, then when the host leaves', () => {
    const props: Partial<SeatPickerRootProps> = {
      occupancy: undefined,
      view: { stage: 'view', seatKey: A },
    };
    const { container, rerender } = render(tree(props));
    const map = () => container.querySelector('[data-chk="map-layer"]') as HTMLElement;
    expect(map().style.visibility).toBe('');
    expect(container.querySelector('[data-chk="view-layer"]')).toBeNull();
    rerender(tree({ ...props, occupancy: { revision: 1 } }));
    expect(map().style.visibility).toBe('hidden');
    rerender(tree({ ...props, occupancy: { revision: 2, taken: [A] } }));
    expect(map().style.visibility).toBe('');
    expect(map().style.getPropertyValue('--chk-_opacity')).toBe('1');
    expect(container.querySelector('[data-chk="view-layer"]')).toBeNull();
    rerender(tree({ occupancy: { revision: 3 }, view: { stage: 'view', seatKey: B } }));
    rerender(tree({ occupancy: { revision: 3 }, view: { stage: 'map' } }));
    expect(map().style.visibility).toBe('');
    expect(map().style.getPropertyValue('--chk-_opacity')).toBe('1');
  });
});

function rootHeight(height: number, width = 390) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const own = this.dataset.chk === 'root';
    return {
      width: own ? width : 0,
      height: own ? height : 0,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    } as DOMRect;
  });
}

describe('the peek fits inside the picker root (M1)', () => {
  it('shrinks the hero instead of clipping when the compact top exceeds ~45% of the root', () => {
    rootHeight(400);
    const { container } = render(tree());
    // header 24 + compact 176 = 200 px > 0.45 * 400
    expect(
      container.querySelector('[data-chk="sheet-body"]')?.hasAttribute('data-chk-compact'),
    ).toBe(true);
  });
  it('keeps the full hero when the root is tall enough, and returns to it when the root grows', () => {
    rootHeight(800);
    const { container } = render(tree());
    expect(
      container.querySelector('[data-chk="sheet-body"]')?.hasAttribute('data-chk-compact'),
    ).toBe(false);
  });
  it('never asks for a peek taller than the root', () => {
    rootHeight(150);
    render(tree());
    expect(stub.snapPoints[1]).toBeLessThanOrEqual(150);
  });
  it('measures a header whose handle margins stay inside it', () => {
    const css = readFileSync('src/sheet/sheet.css', 'utf8');
    expect(css).toMatch(/\[data-chk='sheet-header'\]\)\s*\{[^}]*display: flow-root/);
    rootHeight(800);
    const { container } = render(tree());
    expect(container.querySelector('[data-chk="sheet-header"]')).not.toBeNull();
  });
});

describe('the peek is measured from element rects (M1, browser check)', () => {
  function rects(layoutOf: (el: HTMLElement) => { top: number; bottom: number; width?: number }) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const { top, bottom, width = 390 } = layoutOf(this);
      return {
        top,
        bottom,
        width,
        height: bottom - top,
        x: 0,
        y: top,
        left: 0,
        right: width,
      } as DOMRect;
    });
  }
  it('uses compact bottom minus sheet top plus the body bottom padding, not summed sizes', () => {
    // Browser numbers: sheet top 628, compact block ends at 845 (1 px below a 844 px root).
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (el: Element) =>
        ({
          paddingBottom: (el as HTMLElement).dataset.chk === 'sheet-content' ? '20px' : '0px',
        }) as CSSStyleDeclaration,
    );
    rects((el) => {
      const kind = el.dataset.chk;
      if (kind === 'root') return { top: 119, bottom: 844 };
      if (kind === 'sheet') return { top: 628, bottom: 628 + 691 };
      if (kind === 'sheet-compact') return { top: 650, bottom: 845 };
      return { top: 0, bottom: 0 };
    });
    render(tree());
    expect(stub.snapPoints).toEqual([0, 845 - 628 + 20, 1]);
  });
  it('follows a change of the compact block through the rect difference', () => {
    let compactBottom = 845;
    rects((el) => {
      const kind = el.dataset.chk;
      if (kind === 'root') return { top: 0, bottom: 800 };
      if (kind === 'sheet') return { top: 600, bottom: 1300 };
      if (kind === 'sheet-compact') return { top: 622, bottom: compactBottom };
      return { top: 0, bottom: 0 };
    });
    render(tree());
    expect(stub.snapPoints[1]).toBe(245);
    act(() => {
      compactBottom = 900;
      stub.resize?.();
    });
    expect(stub.snapPoints[1]).toBe(300);
  });
});

describe('scroll independence and short roots (F50, F51)', () => {
  interface Geometry {
    scroll: number;
    compactBottom: number;
    sheetHeight: number;
    rootH: number;
  }
  function layoutWith(state: Geometry) {
    vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(function (this: Element) {
      return (this as HTMLElement).dataset.chk === 'sheet-content' ? state.scroll : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const kind = this.dataset.chk;
      const [top, bottom] =
        kind === 'root'
          ? [0, state.rootH]
          : kind === 'sheet'
            ? [600, 600 + state.sheetHeight]
            : kind === 'sheet-compact'
              ? // The viewport rect moves up by what the scroller has scrolled.
                [622 - state.scroll, state.compactBottom - state.scroll]
              : [0, 0];
      return {
        top,
        bottom,
        width: 600,
        height: bottom - top,
        x: 0,
        y: top,
        left: 0,
        right: 600,
      } as DOMRect;
    });
  }
  it('measures the same peek while the content is scrolled, and after scrolling back (F50)', () => {
    const state: Geometry = { scroll: 0, compactBottom: 845, sheetHeight: 700, rootH: 800 };
    layoutWith(state);
    render(tree());
    expect(stub.snapPoints[1]).toBe(245);
    act(() => {
      state.scroll = 100;
      state.compactBottom = 900;
      stub.resize?.();
    });
    expect(stub.snapPoints[1]).toBe(300);
    act(() => {
      state.scroll = 0;
      stub.resize?.();
    });
    expect(stub.snapPoints[1]).toBe(300);
  });
  it.each([
    ['150 px root, no inset', 150, 116],
    ['150 px root with a 47 px top inset', 150, 69],
    ['a 60 px root', 60, 26],
  ])(
    'keeps the points strictly ascending inside the container: %s (F51)',
    (_name, rootH, sheetHeight) => {
      layoutWith({ scroll: 0, compactBottom: 845, sheetHeight, rootH });
      render(tree());
      const points = stub.snapPoints;
      expect(points[1]!).toBeLessThan(sheetHeight);
      expect(points[1]!).toBeGreaterThan(1);
      expect(points[0]!).toBeLessThan(points[1]!);
      expect(points[1]! / sheetHeight).toBeLessThan(points[2]!);
    },
  );
});

describe('sheet buttons on a narrow root (M2, browser check)', () => {
  it('keeps one-line labels, drops the price from Book below 400 px and keeps Change seat', () => {
    rootHeight(725, 390);
    const { container } = render(tree());
    const actions = container.querySelector('[data-chk="sheet-actions"]') as HTMLElement;
    const labels = [...actions.querySelectorAll('[data-chk="action-label"]')].map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(['Change seat', 'Book']);
    expect(container.querySelector('[data-chk="sheet-sub"]')?.textContent).toContain('1250.00 u');
  });
  it('keeps the price on Book in a wider root', () => {
    rootHeight(725, 600);
    const { container } = render(tree());
    expect(container.querySelector('[data-chk="sheet-actions"]')?.textContent).toMatch(
      /Book · 1250\.00 u/,
    );
  });
});

describe('sheet timing and measurement integration (F12, F20)', () => {
  it('first Root/Sheet mount is instant even after controller settlement; custom easing reaches Sheet', () => {
    const ease = (t: number) => t * t;
    render(tree({ transitions: { sheetIn: { ease } } }));
    const opening = stub.sheetProps.filter((props) => props.isOpen);
    expect(opening.length).toBeGreaterThan(0);
    expect(opening.every((props) => props.prefersReducedMotion === true)).toBe(true);
    expect(opening[0]?.tweenConfig).toEqual({ duration: 0.3, ease });
  });

  it('resnaps an open peek after compact content grows, keeping its actions visible', () => {
    render(tree());
    expect(stub.snapPoints).toEqual([0, 200, 1]);
    act(() => {
      stub.compact = 256;
      stub.resize?.();
    });
    expect(stub.snapPoints).toEqual([0, 280, 1]);
    expect(stub.snapTo).toHaveBeenLastCalledWith(1);
    expect(stub.visiblePx).toBe(280);
    const compact = screen
      .getByRole('button', { name: /Book ·/ })
      .closest('[data-chk="sheet-compact"]');
    expect(compact?.contains(screen.getByRole('button', { name: 'Change seat' }))).toBe(true);
  });

  it('retains the active expanded snap when peek changes', () => {
    const props: ComponentProps<typeof GlassSheet> = {
      open: true,
      snapPoints: [0, 200, 1],
      initialSnap: 1,
      skin: 'plain',
      dimTarget: null,
      dimScene: false,
      dimFromPx: 200,
      dismissible: true,
      mountPoint: document.body,
      label: 'Sheet',
      dragLabel: 'Drag',
      onClose: vi.fn(),
      children: null,
    };
    const { rerender } = render(createElement(GlassSheet, props));
    act(() => {
      (stub.sheetProps.at(-1)?.onSnap as (index: number) => void)(2);
    });
    rerender(createElement(GlassSheet, { ...props, snapPoints: [0, 280, 1] }));
    expect(stub.snapTo).toHaveBeenLastCalledWith(2);
  });
});

// Motion values in this file are real; the Sheet boundary implements the installed library's
// documented snapTo/context contract without requiring layout or a browser animation clock.

describe('unmeasured peek with an earlier numeric snap (F52)', () => {
  it('mounts with snapPoints [0, 100, "peek", 1] before the compact block is measured', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const height = this.dataset.chk === 'root' ? 725 : this.dataset.chk === 'sheet' ? 691 : 0;
      return {
        top: 0,
        bottom: height,
        width: 390,
        height,
        x: 0,
        y: 0,
        left: 0,
        right: 390,
      } as DOMRect;
    });
    stub.compact = 0;
    expect(() => render(tree({ sheet: { snapPoints: [0, 100, 'peek', 1] } }))).not.toThrow();
    const points = stub.snapPoints;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]!;
      const cur = points[i]!;
      const toPx = (v: number) => (v > 0 && v <= 1 ? v * 691 : v);
      expect(toPx(cur)).toBeGreaterThan(toPx(prev));
    }
  });
});
