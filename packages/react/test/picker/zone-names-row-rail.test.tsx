import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildHallLayout, templates } from '@cinema-hall/core';
import { SeatMap } from '../../src/seat-map/SeatMap.js';
import { labels, zoneDisplayName } from '../../src/labels/labels.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('names of the default viewing zones follow the labels', () => {
  const en = labels.en.picker;
  it('names the default zones by id with the default zone labels', () => {
    expect(zoneDisplayName(en, { id: 'sweet-spot', label: 'Sweet spot' })).toBe('Sweet spot');
    expect(zoneDisplayName(en, { id: 'up-close' })).toBe('Up close');
    const picker = {
      ...en,
      defaultZones: {
        'up-close': 'Front rows',
        'sweet-spot': 'Best seats',
        'full-picture': 'Whole screen',
      },
    };
    expect(zoneDisplayName(picker, { id: 'up-close', label: 'Up close' })).toBe('Front rows');
    expect(zoneDisplayName(picker, { id: 'sweet-spot', label: 'Sweet spot' })).toBe('Best seats');
    expect(zoneDisplayName(picker, { id: 'full-picture', label: 'Full picture' })).toBe(
      'Whole screen',
    );
  });

  it('keeps a zone renamed in the hall config, and a custom zone, as written', () => {
    const picker = { ...en, defaultZones: { 'sweet-spot': 'Best seats' } };
    expect(zoneDisplayName(picker, { id: 'sweet-spot', label: 'Middle of the hall' })).toBe(
      'Middle of the hall',
    );
    expect(zoneDisplayName(picker, { id: 'vip', label: 'VIP' })).toBe('VIP');
  });

  it('lets the host override any zone by id', () => {
    const picker = { ...en, zones: { 'sweet-spot': 'Golden middle', vip: 'Premium' } };
    expect(zoneDisplayName(picker, { id: 'sweet-spot', label: 'Sweet spot' })).toBe(
      'Golden middle',
    );
    expect(zoneDisplayName(picker, { id: 'vip', label: 'VIP' })).toBe('Premium');
  });

  it('falls back to the English names for labels made before defaultZones', () => {
    const picker = { ...en, defaultZones: undefined };
    expect(zoneDisplayName(picker, { id: 'up-close', label: 'Up close' })).toBe('Up close');
  });

  it('keeps labels.ru as the English alias', () => {
    expect(labels.ru.picker).toBe(labels.en.picker);
    expect(labels.ru.editor).toBe(labels.en.editor);
    expect(labels.ru.issues).toBe(labels.en.issues);
  });
});

describe('row letters stay in view while a wide map scrolls sideways', () => {
  const layout = buildHallLayout(templates.balcony());
  const renderMap = () =>
    render(
      <SeatMap
        layout={layout}
        status={() => 'available'}
        selected={[]}
        focusKey={null}
        labels={labels.en.picker}
        onFocusSeat={() => undefined}
        onActivate={() => undefined}
      />,
    );

  it('draws no rail while the map fits its box', () => {
    const { container } = renderMap();
    expect(container.querySelector('[data-chk="row-rail"]')).toBeNull();
    expect(container.querySelector('[data-chk="map-scroll"]')?.hasAttribute('data-rail')).toBe(
      false,
    );
  });

  it('shows every row letter in a rail over the left edge when the map overflows', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(900);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 900,
      bottom: 600,
      width: 900,
      height: 600,
      toJSON: () => ({}),
    } as DOMRect);
    const { container } = renderMap();
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    const rail = container.querySelector('[data-chk="row-rail"]');
    expect(rail).not.toBeNull();
    expect(rail?.getAttribute('aria-hidden')).toBe('true');
    const letters = [...rail!.querySelectorAll('[data-chk="row-rail-label"]')].map(
      (node) => node.textContent,
    );
    expect(letters).toEqual(layout.rows.map((row) => row.label));
    expect(container.querySelector('[data-chk="map-scroll"]')?.hasAttribute('data-rail')).toBe(
      true,
    );
    // Each letter sits at its row: the first rows higher than the last.
    const tops = [...rail!.querySelectorAll<HTMLElement>('[data-chk="row-rail-label"]')].map(
      (node) => Number(/\+ ([\d.]+)px/.exec(node.style.top)?.[1]),
    );
    expect(tops[0]!).toBeLessThan(tops.at(-1)!);
  });
});
