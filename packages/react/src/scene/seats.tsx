import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { BufferGeometry } from 'three';
import { Color, InstancedMesh, Matrix4, MeshStandardMaterial } from 'three';
import { useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { HallLayout, Seat, SeatTypeInfo } from '@cinema-hall/core';
import {
  buildProceduralSeat,
  buildSeatModelGeometry,
  disposeModel,
  disposeSeatGeometry,
  type SeatGeometry,
} from './geometry.js';
import { seatColor, type SeatPaint } from './paint.js';
import type { SeatModelSource } from './types.js';

const WHITE = new Color(1, 1, 1);

/**
 * Props of `SeatLayer`: the layout, the seat paint, and the GLB models for seat types. A seat type
 * without a model is drawn procedurally.
 */
export interface SeatLayerProps {
  layout: HallLayout;
  paint: SeatPaint;
  seatModels?: Record<string, 'procedural' | SeatModelSource>;
}

/**
 * All seats, one InstancedMesh per seat type. A GLB seat type with a `tintMaterial` gives two
 * InstancedMeshes
 * (the tinted part and the fixed part), so two draw calls for that type. This is by design: the two
 * parts need
 * different colour handling. Every other seat type is one draw call.
 */
export function SeatLayer({ layout, paint, seatModels }: SeatLayerProps): ReactNode {
  const groups = useMemo(() => groupByType(layout.seats), [layout.seats]);
  return (
    <>
      {[...groups].map(([typeId, seats]) => {
        const info = layout.seatTypes[typeId];
        if (!info) return null;
        return (
          <SeatTypeLayer
            key={typeId}
            info={info}
            seats={seats}
            source={seatModels?.[typeId] ?? 'procedural'}
            paint={paint}
          />
        );
      })}
    </>
  );
}

function groupByType(seats: readonly Seat[]): Map<string, Seat[]> {
  const groups = new Map<string, Seat[]>();
  for (const seat of seats) {
    const list = groups.get(seat.seatTypeId);
    if (list) list.push(seat);
    else groups.set(seat.seatTypeId, [seat]);
  }
  return groups;
}

interface LoadedSeat {
  /** Names the model the seat type asked for when it loaded. */
  key: string;
  geometry: SeatGeometry;
}

/**
 * Geometry of one seat type: procedural by default, or a GLB once the requested model has loaded.
 * While the
 * model is pending, or after it failed, the procedural seat stands in. A model that is no longer
 * drawn is freed
 * as soon as it stops being drawn, and the GLB's own resources are freed as soon as they have been
 * merged.
 */
function useSeatGeometry(info: SeatTypeInfo, source: 'procedural' | SeatModelSource): SeatGeometry {
  const { width, depth } = info;
  const procedural = useMemo<SeatGeometry>(
    () => ({ tinted: buildProceduralSeat(width, depth), fixed: null }),
    [width, depth],
  );
  useEffect(() => () => disposeSeatGeometry(procedural), [procedural]);

  const url = source === 'procedural' ? null : source.url;
  const scale = source === 'procedural' ? 1 : (source.scale ?? 1);
  const tintMaterial = source === 'procedural' ? undefined : source.tintMaterial;
  const key = url === null ? null : `${url}|${scale}|${tintMaterial ?? ''}`;
  const [loaded, setLoaded] = useState<LoadedSeat | null>(null);

  // A loaded model that is no longer the one drawn (the seat is procedural again, or a replacement is pending)
  // leaves the state here; the effect below frees it.
  useEffect(() => {
    if (loaded !== null && loaded.key !== key) setLoaded(null);
  }, [loaded, key]);

  useEffect(() => {
    const owned = loaded?.geometry ?? null;
    return () => {
      if (owned) disposeSeatGeometry(owned);
    };
  }, [loaded]);

  useEffect(() => {
    if (url === null || key === null) return;
    let alive = true;
    new GLTFLoader().load(
      url,
      (gltf) => {
        const built = buildSeatModelGeometry(gltf.scene, scale, tintMaterial);
        // The merge has copied what the scene draws: the model's own resources go now, wanted or not.
        disposeModel(gltf.scene);
        if (!alive) {
          if (built) disposeSeatGeometry(built);
          return;
        }
        setLoaded(built ? { key, geometry: built } : null);
      },
      undefined,
      () => {
        if (alive) setLoaded(null);
      },
    );
    return () => {
      alive = false;
    };
  }, [url, key, scale, tintMaterial]);

  return loaded !== null && loaded.key === key ? loaded.geometry : procedural;
}

function SeatTypeLayer({
  info,
  seats,
  source,
  paint,
}: {
  info: SeatTypeInfo;
  seats: readonly Seat[];
  source: 'procedural' | SeatModelSource;
  paint: SeatPaint;
}): ReactNode {
  const geometry = useSeatGeometry(info, source);
  return (
    <>
      {geometry.tinted ? (
        <SeatInstances geometry={geometry.tinted} seats={seats} paint={paint} tinted />
      ) : null}
      {geometry.fixed ? (
        <SeatInstances geometry={geometry.fixed} seats={seats} paint={paint} tinted={false} />
      ) : null}
    </>
  );
}

function SeatInstances({
  geometry,
  seats,
  paint,
  tinted,
}: {
  geometry: BufferGeometry;
  seats: readonly Seat[];
  paint: SeatPaint;
  tinted: boolean;
}): ReactNode {
  const { invalidate } = useThree();
  const material = useMemo(
    () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  const mesh = useMemo(() => {
    const instanced = new InstancedMesh(geometry, material, seats.length);
    const matrix = new Matrix4();
    seats.forEach((seat, i) => {
      matrix.makeTranslation(seat.position.x, seat.position.y, seat.position.z);
      instanced.setMatrixAt(i, matrix);
      // Creates the instance colour buffer up front; the colour effect below overwrites it.
      if (tinted) instanced.setColorAt(i, WHITE);
    });
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
    return instanced;
  }, [geometry, material, seats, tinted]);
  useEffect(() => () => mesh.dispose(), [mesh]);
  // Imperative matrices and colours draw only when a frame is requested ("demand" frameloop).
  useEffect(() => {
    invalidate();
  }, [mesh, invalidate]);

  useEffect(() => {
    if (!tinted) return;
    const color = new Color();
    seats.forEach((seat, i) => {
      mesh.setColorAt(i, seatColor(seat, paint, color));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    invalidate();
  }, [mesh, seats, paint, tinted, invalidate]);

  return <primitive object={mesh} />;
}
