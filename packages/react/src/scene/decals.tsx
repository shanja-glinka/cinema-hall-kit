import { useEffect, useState, type ReactNode } from 'react';
import { SRGBColorSpace, TextureLoader, type Texture } from 'three';
import type { HallLayout } from '@cinema-hall/core';
import { decalPlacement } from './math.js';
import type { Decal } from './types.js';

/** Props of `Decals`: the decals to draw, and the hall box they are placed in. */
export interface DecalsProps {
  decals: readonly Decal[];
  hall: HallLayout['hall'];
}

/** Images on the walls, sized by width with the aspect of the image. */
export function Decals({ decals, hall }: DecalsProps): ReactNode {
  return (
    <>
      {decals.map((decal, index) => (
        <DecalPlane key={`${decal.wall}-${index}-${decal.src}`} decal={decal} hall={hall} />
      ))}
    </>
  );
}

interface MediaSize {
  width?: number;
  height?: number;
}

function DecalPlane({ decal, hall }: { decal: Decal; hall: HallLayout['hall'] }): ReactNode {
  const [media, setMedia] = useState<{ texture: Texture; aspect: number } | null>(null);
  useEffect(() => {
    let alive = true;
    let loaded: Texture | null = null;
    const loader = new TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      decal.src,
      (texture) => {
        if (!alive) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        loaded = texture;
        const image = texture.image as MediaSize | undefined;
        const aspect = image?.width && image?.height ? image.width / image.height : 1;
        setMedia({ texture, aspect });
      },
      undefined,
      () => undefined,
    );
    return () => {
      alive = false;
      loaded?.dispose();
    };
  }, [decal.src]);

  if (!media) return null;
  const { position, rotationY } = decalPlacement(decal, hall);
  return (
    <mesh position={[position.x, position.y, position.z]} rotation={[0, rotationY, 0]}>
      <planeGeometry args={[decal.width, decal.width / media.aspect]} />
      <meshBasicMaterial map={media.texture} transparent toneMapped={false} />
    </mesh>
  );
}
