import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { TransitionConfig } from '../../src/transitions/presets.js';
import type { SeatPickerRootProps } from '../../src/seat-picker/types.js';

import type { SeatPicker } from '../../src/seat-picker/SeatPicker.js';
import type { SeatPickerRoot } from '../../src/seat-picker/SeatPickerRoot.js';

// Compiled by `typecheck`: shared phase props (duration, delay, ease) must be accepted on every phase.
const config: TransitionConfig = {
  sheetIn: { duration: 600, ease: 'linear' },
  mapZoom: { maxScale: 2, duration: 300, delay: 0, ease: [0.2, 0, 0.2, 1] },
  cameraFlight: { arcHeight: 0, duration: 900 },
};

// Compiled by `typecheck`: the booking data type flows into onBooked.
type Booking = { reference: string; seats: number };
const props: SeatPickerRootProps<Booking> = {
  onBooked: (result) => {
    const reference: string = result.data.reference;
    expect(reference.length).toBeGreaterThan(0);
  },
};

describe('public types', () => {
  it('accept shared phase props and a typed booking result', () => {
    expect(config.sheetIn).toEqual({ duration: 600, ease: 'linear' });
    expect(typeof props.onBooked).toBe('function');
  });
});

describe('public picker exports and generic components (A8)', () => {
  it('retains every public picker path and booking data on both generic components', () => {
    expectTypeOf<Parameters<typeof SeatPicker<Booking>>[0]>().toExtend<
      SeatPickerRootProps<Booking>
    >();
    expectTypeOf<Parameters<typeof SeatPickerRoot<Booking>>[0]>().toExtend<
      SeatPickerRootProps<Booking>
    >();
    const source = readFileSync('src/index.ts', 'utf8')
      .split('// Seat picker')[1]!
      .split('// Hall constructor')[0]!;
    const exports = [
      'SeatPicker',
      'SeatPickerProps',
      'SeatPickerRoot',
      'SeatPickerMap',
      'SeatPickerView',
      'SeatPickerViewProps',
      'SeatPickerSheet',
      'useSeatPicker',
      'SeatPickerRootProps',
      'SeatPickerState',
      'SelectionMode',
      'OpenViewOn',
      'ViewState',
      'BookingStatus',
      'SheetOptions',
      'TransitionEventInfo',
      'SeatMap',
      'SeatMapProps',
      'TransitionConfig',
      'TransitionsProp',
      'TransitionPresetName',
      'MotionMode',
      'PhaseName',
      'TransitionProgress',
      'Direction',
      'SheetSkin',
      'SnapValue',
    ];
    for (const name of exports) expect(source).toMatch(new RegExp('\\b' + name + '\\b'));
    for (const path of [
      'seat-picker/SeatPicker',
      'seat-picker/SeatPickerRoot',
      'seat-picker/SeatPickerMap',
      'seat-picker/SeatPickerView',
      'seat-picker/SeatPickerSheet',
      'seat-picker/use-seat-picker',
      'seat-picker/types',
      'seat-map/SeatMap',
      'transitions/presets',
      'transitions/controller',
      'transitions/timeline',
      'sheet/GlassSheet',
      'sheet/snap',
    ])
      expect(source).toContain(`'./${path}.js'`);
  });
});
