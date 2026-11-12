import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import {
  BoxGeometry,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from 'three';
import type { SeatKey } from '@cinema-hall/core';
import type { SeatPaint } from '../../src/scene/paint.js';
import { SeatLayer } from '../../src/scene/seats.js';
import { fixtureLayout } from './fixtures.js';

vi.mock('@react-three/fiber', () => ({
  useThree: () => ({ invalidate: () => undefined }),
}));

const loads = vi.hoisted(() => ({
  pending: [] as {
    url: string;
    onLoad: (gltf: { scene: Object3D }) => void;
    onError: () => void;
  }[],
}));

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    load(
      url: string,
      onLoad: (gltf: { scene: Object3D }) => void,
      _progress: unknown,
      onError: () => void,
    ): void {
      loads.pending.push({ url, onLoad, onError });
    }
  },
}));

const paint: SeatPaint = {
  accent: '#ff0000',
  danger: '#00ff00',
  selected: new Set<SeatKey>(),
  dangerSections: new Set<string>(),
  blocked: new Set<SeatKey>(),
  themeSeatColors: {},
};

/** A GLB-like scene: one mesh with the tint material, and its own geometry. */
function model(): { scene: Group; geometry: BoxGeometry } {
  const geometry = new BoxGeometry(0.5, 0.5, 0.5);
  const scene = new Group();
  scene.add(new Mesh(geometry, new MeshStandardMaterial({ name: 'Seat' })));
  return { scene, geometry };
}

afterEach(() => {
  cleanup();
  loads.pending.length = 0;
  vi.restoreAllMocks();
});

describe('GLB seat models', () => {
  it('frees a model that arrives after its seat type was unmounted', () => {
    const { unmount } = render(
      <SeatLayer
        layout={fixtureLayout}
        paint={paint}
        seatModels={{ standard: { url: 'chair.glb', tintMaterial: 'Seat' } }}
      />,
    );
    const request = loads.pending[0];
    if (!request) throw new Error('no load requested');
    unmount();

    const loaded = model();
    const freed = vi.fn();
    loaded.geometry.addEventListener('dispose', freed);
    act(() => request.onLoad({ scene: loaded.scene }));
    expect(freed).toHaveBeenCalled();
  });

  it('frees a loaded model as soon as its replacement is pending', () => {
    const { rerender } = render(
      <SeatLayer
        layout={fixtureLayout}
        paint={paint}
        seatModels={{ standard: { url: 'a.glb', tintMaterial: 'Seat' } }}
      />,
    );
    const first = loads.pending[0];
    if (!first) throw new Error('no load requested');
    act(() => first.onLoad({ scene: model().scene }));

    const disposed = vi.spyOn(BufferGeometry.prototype, 'dispose');
    rerender(
      <SeatLayer
        layout={fixtureLayout}
        paint={paint}
        seatModels={{ standard: { url: 'b.glb', tintMaterial: 'Seat' } }}
      />,
    );
    // The replacement is pending, so the first model is no longer drawn: it is freed now.
    expect(disposed).toHaveBeenCalled();

    const second = loads.pending[1];
    if (!second) throw new Error('no replacement requested');
    act(() => second.onLoad({ scene: model().scene }));
  });

  it('frees a loaded model as soon as its seat type is procedural again', () => {
    const { rerender } = render(
      <SeatLayer
        layout={fixtureLayout}
        paint={paint}
        seatModels={{ standard: { url: 'a.glb', tintMaterial: 'Seat' } }}
      />,
    );
    const first = loads.pending[0];
    if (!first) throw new Error('no load requested');
    act(() => first.onLoad({ scene: model().scene }));

    const disposed = vi.spyOn(BufferGeometry.prototype, 'dispose');
    rerender(
      <SeatLayer layout={fixtureLayout} paint={paint} seatModels={{ standard: 'procedural' }} />,
    );
    expect(disposed).toHaveBeenCalled();
  });
});
