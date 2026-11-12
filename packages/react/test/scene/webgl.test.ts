import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

/** Loads a fresh copy of the module (its probe is cached) with a canvas whose getContext is `getContext`. */
async function probe(getContext: (name: string) => unknown): Promise<boolean> {
  vi.resetModules();
  const canvas = { getContext };
  vi.spyOn(document, 'createElement').mockImplementation(
    (() => canvas) as unknown as typeof document.createElement,
  );
  const { hasWebgl } = await import('../../src/scene/webgl.js');
  return hasWebgl();
}

describe('WebGL probe', () => {
  it('needs a WebGL 2 context: a WebGL 1 context is not enough for the renderer', async () => {
    expect(await probe((name) => (name === 'webgl' ? {} : null))).toBe(false);
  });

  it('accepts a WebGL 2 context', async () => {
    expect(await probe((name) => (name === 'webgl2' ? {} : null))).toBe(true);
  });

  it('is false when creating the context throws', async () => {
    expect(
      await probe(() => {
        throw new Error('no GPU');
      }),
    ).toBe(false);
  });
});
