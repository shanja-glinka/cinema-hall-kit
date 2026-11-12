import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { RectAreaLight } from 'three';
import { Vector3 } from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import type { HallLayout, ScreenContent } from '@cinema-hall/core';
import { buildScreenGeometry } from './geometry.js';
import { screenMaterialProps } from './textures.js';
import { useScreenMedia } from './use-screen-media.js';

let rectAreaReady = false;

/** Area lights need their lookup textures once, before the first shader is compiled. */
function ensureRectAreaLights(): void {
  if (rectAreaReady) return;
  RectAreaLightUniformsLib.init();
  rectAreaReady = true;
}

/**
 * Props of `ScreenSurface`: the screen geometry, its content, and a callback that runs once the
 * content has settled (loaded, or failed to load).
 */
export interface ScreenSurfaceProps {
  screen: HallLayout['screen'];
  content?: ScreenContent;
  onSettled: () => void;
}

/**
 * The screen: a flat or curved plane with the content, a black masking border behind it, and the
 * area
 * light that makes the screen the main light source of the hall.
 */
export function ScreenSurface({ screen, content, onSettled }: ScreenSurfaceProps): ReactNode {
  const { invalidate } = useThree();
  useMemo(() => ensureRectAreaLights(), []);

  const { width, height, curvature, center } = screen;
  const aspect = height > 0 ? width / height : 1;
  const geometry = useMemo(
    () => buildScreenGeometry(width, height, curvature, center.y),
    [width, height, curvature, center.y],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  const media = useScreenMedia(content, aspect, onSettled);
  const material = screenMaterialProps(media.texture !== null);

  // A new picture reaches the material in a React commit, and a settled screen without one (a failed image)
  // changes readiness in the same commit: ask for the frame that shows it, which is also the frame onReady waits for.
  useEffect(() => {
    invalidate();
  }, [media.texture, media.ready, invalidate]);

  // A playing video changes every frame; keep the loop going while it plays.
  useFrame(() => {
    if (media.video && !media.video.paused) invalidate();
  });

  const lightRef = useRef<RectAreaLight>(null);
  useEffect(() => {
    lightRef.current?.lookAt(new Vector3(center.x, center.y, 10));
  }, [center.x, center.y]);

  return (
    <group>
      <mesh position={[0, center.y, -0.02]}>
        <planeGeometry args={[width + 0.5, height + 0.5]} />
        <meshBasicMaterial color="#000000" toneMapped={false} />
      </mesh>
      <mesh geometry={geometry}>
        {/* Keyed by the texture: three compiles `map` into the shader, so switching a compiled material
            from no map to a map (or to another texture object) needs a fresh material, not a prop update. */}
        <meshBasicMaterial
          key={media.texture?.uuid ?? 'solid'}
          map={media.texture}
          color={material.color}
          toneMapped={material.toneMapped}
          fog={material.fog}
        />
      </mesh>
      <rectAreaLight
        ref={lightRef}
        args={['#fff0dc', 3, width, height]}
        position={[0, center.y, 0.12]}
      />
    </group>
  );
}
