import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Occupancy } from '@cinema-hall/core';
import { useAcceptedOccupancy } from '../../src/seat-picker/use-accepted-occupancy.js';
import { useControllable } from '../../src/seat-picker/use-controllable.js';

describe('useAcceptedOccupancy', () => {
  const at = (revision: number | string, extra: Partial<Occupancy> = {}): Occupancy => ({
    revision,
    ...extra,
  });

  it('ignores a snapshot older than the accepted one (numbers)', () => {
    const { result, rerender } = renderHook(
      ({ occupancy }: { occupancy: Occupancy | undefined }) => useAcceptedOccupancy(occupancy),
      { initialProps: { occupancy: at(5) } },
    );
    rerender({ occupancy: at(3, { taken: ['x'] }) });
    expect(result.current?.revision).toBe(5);
    rerender({ occupancy: at(6) });
    expect(result.current?.revision).toBe(6);
  });

  it('compares string revisions with core ordering, not with a local rule', () => {
    const { result, rerender } = renderHook(
      ({ occupancy }: { occupancy: Occupancy | undefined }) => useAcceptedOccupancy(occupancy),
      { initialProps: { occupancy: at('a') } },
    );
    rerender({ occupancy: at('b') });
    expect(result.current?.revision).toBe('b');
    rerender({ occupancy: at('a', { taken: ['x'] }) });
    expect(result.current?.revision).toBe('b');
  });

  it('is inert (undefined) until a snapshot arrives', () => {
    const { result, rerender } = renderHook(
      ({ occupancy }: { occupancy: Occupancy | undefined }) => useAcceptedOccupancy(occupancy),
      { initialProps: { occupancy: undefined as Occupancy | undefined } },
    );
    expect(result.current).toBeUndefined();
    rerender({ occupancy: at(1) });
    expect(result.current?.revision).toBe(1);
  });
});

describe('useControllable', () => {
  it('controlled: renders the host value and only reports requested changes', () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ value }: { value: string[] | undefined }) => useControllable(value, [], onChange),
      { initialProps: { value: ['a'] as string[] | undefined } },
    );
    act(() => result.current.set(['a', 'b']));
    expect(onChange).toHaveBeenLastCalledWith(['a', 'b']);
    expect(result.current.value).toEqual(['a']);
    expect(result.current.read()).toEqual(['a']);
    rerender({ value: ['a', 'b'] });
    expect(result.current.value).toEqual(['a', 'b']);
  });

  it('uncontrolled: keeps the value and reports it', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useControllable<string[]>(undefined, ['x'], onChange));
    expect(result.current.value).toEqual(['x']);
    act(() => result.current.set(['y']));
    expect(result.current.value).toEqual(['y']);
    expect(result.current.read()).toEqual(['y']);
    expect(onChange).toHaveBeenCalledWith(['y']);
  });
});
