import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { templates } from '@cinema-hall/core';
import { useHallEditor } from '../../src/constructor/editor/use-hall-editor.js';

describe('the editor layout uses the editor constraints', () => {
  it('builds the balcony sizes from useHallEditor({ constraints })', () => {
    const initial = templates.balcony();
    const plain = renderHook(() => useHallEditor({ initial }));
    expect(plain.result.current.layout.balconySlabThickness).toBe(
      initial.constraints?.balconySlabThickness ?? 0.3,
    );
    const constraints = { balconySlabThickness: 0.45, balconyParapetHeight: 1.1 };
    const custom = renderHook(() => useHallEditor({ initial, constraints }));
    expect(custom.result.current.layout.balconySlabThickness).toBe(0.45);
    expect(custom.result.current.layout.balconyParapetHeight).toBe(1.1);
  });
});
