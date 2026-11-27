import type { ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Fog } from 'three';
import type { HallLayout } from '@cinema-hall/core';

/**
 * Fog distances that keep a whole hall readable from an orbit camera: the fog starts beyond the far
 * corner of the hall, even from the cutaway view outside it, so walls, risers and seats keep their
 * colour from any viewpoint.
 * @param hall Hall box in metres.
 * @returns The fog's near and far distances.
 */
export function editorFog(hall: HallLayout['hall']): { near: number; far: number } {
  const diagonal = Math.hypot(hall.width, hall.depth, hall.height);
  // The opening view stands well outside the hall (see `editorOverviewPose`): no fog before its far side.
  return { near: diagonal * 2.5, far: diagonal * 6 };
}

/**
 * Intensities of the constructor's work light. The hall's own colours are dark (a cinema), so the
 * light is strong enough for the floor, the risers, the balcony slabs and the walls to read apart.
 */
export const EDITOR_LIGHT = { ambient: 0.9, hemisphere: 1.1, key: 1.8, fill: 0.6 } as const;

/**
 * Work light for the constructor's 3D preview, added on top of the cinema lighting of the shared
 * scene. The booking view is lit by the screen alone, which suits a seat facing the screen; the
 * constructor looks at the hall from the back and the sides, where that leaves the seats, the risers
 * and the walls almost black. Soft ambient and hemisphere light, a key light from above the back of
 * the hall and a dim fill from the front make their shapes readable, and the fog is pushed beyond the
 * hall. Only lights and fog distances: no gradients or textures.
 * @param props The hall box.
 * @param props.hall Hall box in metres.
 * @returns The lights, to render inside `HallPreview`.
 * @example <HallPreview layout={layout}><EditorLighting hall={layout.hall} /></HallPreview>
 */
export function EditorLighting({ hall }: { hall: HallLayout['hall'] }): ReactNode {
  const { scene } = useThree();
  const { near, far } = editorFog(hall);
  // The shared scene attaches its own fog; this runs before every frame is drawn and moves it out.
  useFrame(() => {
    const fog = scene.fog;
    if (fog instanceof Fog && (fog.near !== near || fog.far !== far)) {
      fog.near = near;
      fog.far = far;
    }
  });
  return (
    <>
      <ambientLight intensity={EDITOR_LIGHT.ambient} color="#fff6ec" />
      <hemisphereLight args={['#fff1e2', '#3a322c', EDITOR_LIGHT.hemisphere]} />
      <directionalLight
        position={[hall.width * 0.35, hall.height * 2.2, hall.depth * 1.1]}
        intensity={EDITOR_LIGHT.key}
        color="#fff4e6"
      />
      <directionalLight
        position={[-hall.width * 0.6, hall.height * 1.2, -hall.depth * 0.3]}
        intensity={EDITOR_LIGHT.fill}
        color="#e6ecff"
      />
    </>
  );
}
