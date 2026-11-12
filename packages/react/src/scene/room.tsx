import { useEffect, useMemo, type ReactNode } from 'react';
import { DoubleSide, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three';
import type { HallLayout } from '@cinema-hall/core';
import type { SceneColors } from '../theme/tokens.js';
import { buildCurtains, buildCeilingDot, buildPlatforms } from './geometry.js';
import { ceilingLightSpots } from './math.js';

/**
 * Props of `Room`: the layout, the scene colours, and whether curtains and ceiling lights are
 * drawn.
 */
export interface RoomProps {
  layout: HallLayout;
  colors: SceneColors;
  curtains: boolean;
  ceilingLights: boolean;
}

/** Floor, walls, ceiling, the stepped rows, curtains and ceiling dots. Walls are plain planes. */
export function Room({ layout, colors, curtains, ceilingLights }: RoomProps): ReactNode {
  const { width, depth, height } = layout.hall;
  const middleZ = (depth - 0.05) / 2;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, middleZ]}>
        <planeGeometry args={[width, depth + 0.05]} />
        <meshStandardMaterial color={colors.floor} roughness={0.9} metalness={0} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]} position={[-width / 2, height / 2, middleZ]}>
        <planeGeometry args={[depth + 0.05, height]} />
        <meshStandardMaterial color={colors.wall} roughness={0.95} metalness={0} />
      </mesh>
      <mesh rotation={[0, -Math.PI / 2, 0]} position={[width / 2, height / 2, middleZ]}>
        <planeGeometry args={[depth + 0.05, height]} />
        <meshStandardMaterial color={colors.wall} roughness={0.95} metalness={0} />
      </mesh>
      <mesh rotation={[0, Math.PI, 0]} position={[0, height / 2, depth]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color={colors.wall} roughness={0.95} metalness={0} />
      </mesh>
      {/* The wall behind the screen. */}
      <mesh position={[0, height / 2, -0.05]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color={colors.wall} roughness={0.95} metalness={0} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, height, middleZ]}>
        <planeGeometry args={[width, depth + 0.05]} />
        <meshStandardMaterial color={colors.wall} roughness={0.95} metalness={0} />
      </mesh>
      <Platforms layout={layout} colour={colors.floor} />
      {curtains ? <Curtains width={width} height={height} colour={colors.curtain} /> : null}
      {ceilingLights ? <CeilingLights hall={layout.hall} /> : null}
    </group>
  );
}

function Platforms({ layout, colour }: { layout: HallLayout; colour: string }): ReactNode {
  const geometry = useMemo(() => buildPlatforms(layout), [layout]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={colour} roughness={0.85} metalness={0} />
    </mesh>
  );
}

function Curtains({
  width,
  height,
  colour,
}: {
  width: number;
  height: number;
  colour: string;
}): ReactNode {
  const geometry = useMemo(() => buildCurtains(width, height), [width, height]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={colour} roughness={0.9} metalness={0} side={DoubleSide} />
    </mesh>
  );
}

function CeilingLights({ hall }: { hall: HallLayout['hall'] }): ReactNode {
  const parts = useMemo(() => {
    const geometry = buildCeilingDot();
    const material = new MeshBasicMaterial({ color: '#ffe3b8', toneMapped: false });
    const spots = ceilingLightSpots(hall);
    const mesh = new InstancedMesh(geometry, material, spots.length);
    const matrix = new Matrix4();
    spots.forEach((spot, i) => {
      matrix.makeTranslation(spot.x, spot.y, spot.z);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return { geometry, material, mesh };
  }, [hall]);
  useEffect(() => {
    const { geometry, material, mesh } = parts;
    return () => {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    };
  }, [parts]);
  return <primitive object={parts.mesh} />;
}
