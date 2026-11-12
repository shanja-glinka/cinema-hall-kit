import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeatMap } from '../../src/seat-map/SeatMap.js';
import { labels } from '../../src/labels/labels.js';
import { makeLayout } from './fixtures.js';

afterEach(() => cleanup());

describe('classNames reach the seat map parts (F24)', () => {
  it('adds the host classes to seats, legend, row labels and the screen', () => {
    const { container } = render(
      <SeatMap
        layout={makeLayout(2, 2)}
        status={() => 'available'}
        selected={[]}
        focusKey={null}
        labels={labels.en.picker}
        onFocusSeat={vi.fn()}
        onActivate={vi.fn()}
        classNames={{
          seat: 'host-seat',
          legend: 'host-legend',
          rowLabel: 'host-row',
          mapScreen: 'host-screen',
        }}
      />,
    );
    expect(container.querySelectorAll('.host-seat')).toHaveLength(4);
    expect(container.querySelectorAll('.host-row')).toHaveLength(2);
    expect(container.querySelector('.host-legend')).not.toBeNull();
    expect(container.querySelector('.host-screen')).not.toBeNull();
    expect(container.querySelector('[data-chk="screen-glow"]')).not.toBeNull();
  });
});
