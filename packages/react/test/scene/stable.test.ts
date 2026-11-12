import { describe, expect, it } from 'vitest';
import { sameJson, sameScene } from '../../src/scene/stable.js';

describe('scene equality', () => {
  it('treats equal plain options as the same scene', () => {
    const a = { curtains: true, decals: [{ wall: 'back' as const, src: '/a.png', width: 3 }] };
    const b = { curtains: true, decals: [{ wall: 'back' as const, src: '/a.png', width: 3 }] };
    expect(sameScene(a, b)).toBe(true);
  });

  it('detects a changed value', () => {
    expect(sameScene({ maxDpr: 2 }, { maxDpr: 1 })).toBe(false);
    expect(sameScene({ camera: { fov: 60 } }, { camera: { fov: 50 } })).toBe(false);
  });

  it('compares avatar callbacks by identity', () => {
    const tint = () => '#ffffff';
    expect(sameScene({ avatar: { tint } }, { avatar: { tint } })).toBe(true);
    expect(sameScene({ avatar: { tint } }, { avatar: { tint: () => '#ffffff' } })).toBe(false);
    expect(sameScene({ avatar: 'none' }, { avatar: 'silhouette' })).toBe(false);
  });

  it('treats two undefined scenes as equal', () => {
    expect(sameScene(undefined, undefined)).toBe(true);
    expect(sameScene(undefined, { maxDpr: 2 })).toBe(false);
  });

  it('compares plain data by value', () => {
    expect(sameJson({ a: [1, 2] }, { a: [1, 2] })).toBe(true);
    expect(sameJson({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });
});
