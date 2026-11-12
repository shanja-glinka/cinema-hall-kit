import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { BufferGeometry, Texture } from 'three';
import {
  Color,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  SRGBColorSpace,
  TextureLoader,
} from 'three';
import { useThree } from '@react-three/fiber';
import type { Avatars, Seat, SeatKey, Vec3 } from '@cinema-hall/core';
import { planAvatars, splitHeads } from './avatar-plan.js';
import { buildAvatarBody, buildAvatarHead } from './geometry.js';
import type { AvatarOptions } from './types.js';

const SPRITE_SIZE = 0.26;
const NO_PHOTOS: ReadonlySet<SeatKey> = new Set();

/** Props of `AvatarLayer`: the occupied seats, the host's avatars, and the avatar options. */
export interface AvatarLayerProps {
  /** Occupied seats, the camera's own seat already left out. */
  seats: readonly Seat[];
  avatars?: Avatars;
  options: AvatarOptions;
}

/**
 * Avatars on taken seats: an instanced body (or the host's geometry) and an instanced sphere head
 * per avatar.
 * A textured head (a photo, at most 32) is a sprite only while its photo is loaded; otherwise the
 * avatar keeps
 * its sphere in the shared head batch.
 */
export function AvatarLayer({ seats, avatars, options }: AvatarLayerProps): ReactNode {
  const { geometry: customBody, tint, headTexture } = options;
  const { invalidate } = useThree();
  const specs = useMemo(
    () => planAvatars(seats, avatars, { tint, headTexture }),
    [seats, avatars, tint, headTexture],
  );

  const body = useMemo<BufferGeometry>(() => customBody ?? buildAvatarBody(), [customBody]);
  useEffect(() => {
    // The host owns a custom geometry; only the built-in body is ours to free.
    if (customBody) return;
    return () => body.dispose();
  }, [body, customBody]);

  const head = useMemo(() => buildAvatarHead(), []);
  useEffect(() => () => head.dispose(), [head]);

  const material = useMemo(() => new MeshStandardMaterial({ roughness: 0.85, metalness: 0 }), []);
  useEffect(() => () => material.dispose(), [material]);

  // The seats whose photo has loaded: only these heads are sprites.
  const [shown, setShown] = useState<ReadonlySet<SeatKey>>(NO_PHOTOS);
  const onPhoto = useCallback((key: SeatKey, loaded: boolean) => {
    setShown((previous) => {
      if (previous.has(key) === loaded) return previous;
      const next = new Set(previous);
      if (loaded) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const bodies = useMemo(
    () =>
      instancedAt(
        body,
        material,
        specs.map((spec) => ({ position: spec.bodyPosition, color: spec.color })),
      ),
    [body, material, specs],
  );
  const heads = useMemo(
    () =>
      instancedAt(
        head,
        material,
        splitHeads(specs, shown).heads.map((spec) => ({
          position: spec.headPosition,
          color: spec.color,
        })),
      ),
    [head, material, specs, shown],
  );
  useEffect(
    () => () => {
      bodies.dispose();
      heads.dispose();
    },
    [bodies, heads],
  );
  useEffect(() => {
    invalidate();
  }, [bodies, heads, invalidate]);

  return (
    <>
      <primitive object={bodies} />
      <primitive object={heads} />
      {specs.map((spec) =>
        spec.textured && spec.imageUrl ? (
          <TexturedHead
            key={spec.key}
            itemKey={spec.key}
            url={spec.imageUrl}
            position={spec.headPosition}
            onPhoto={onPhoto}
          />
        ) : null,
      )}
    </>
  );
}

function instancedAt(
  geometry: BufferGeometry,
  material: MeshStandardMaterial,
  items: readonly { position: Vec3; color: string }[],
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, items.length);
  const matrix = new Matrix4();
  const color = new Color();
  items.forEach((item, i) => {
    matrix.makeTranslation(item.position.x, item.position.y, item.position.z);
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, color.set(item.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/**
 * A billboard with the avatar's photo. It reports to the layer whether the photo is on screen, so
 * that the
 * layer draws the avatar's sphere in the shared batch whenever there is no photo.
 */
function TexturedHead({
  itemKey,
  url,
  position,
  onPhoto,
}: {
  itemKey: SeatKey;
  url: string;
  position: Vec3;
  onPhoto: (key: SeatKey, loaded: boolean) => void;
}): ReactNode {
  const { invalidate } = useThree();
  const [texture, setTexture] = useState<Texture | null>(null);
  // A texture is freed when it leaves the sprite (replaced by another photo, or the head is gone).
  useEffect(() => () => texture?.dispose(), [texture]);
  useEffect(() => {
    let alive = true;
    const loader = new TextureLoader();
    loader.setCrossOrigin('anonymous');
    setTexture(null);
    loader.load(
      url,
      (next) => {
        next.colorSpace = SRGBColorSpace;
        if (!alive) {
          next.dispose();
          return;
        }
        setTexture(next);
        onPhoto(itemKey, true);
      },
      undefined,
      () => {
        if (alive) onPhoto(itemKey, false);
      },
    );
    return () => {
      alive = false;
      onPhoto(itemKey, false);
    };
  }, [url, itemKey, onPhoto]);
  useEffect(() => {
    invalidate();
  }, [texture, invalidate]);

  if (!texture) return null;
  const at: [number, number, number] = [position.x, position.y, position.z];
  return (
    <sprite position={at} scale={[SPRITE_SIZE, SPRITE_SIZE, 1]}>
      <spriteMaterial map={texture} transparent />
    </sprite>
  );
}
