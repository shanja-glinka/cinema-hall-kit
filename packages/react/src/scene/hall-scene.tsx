import { useEffect, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Avatars, HallLayout, ScreenContent, Seat } from '@cinema-hall/core';
import type { SceneColors } from '../theme/tokens.js';
import { AvatarLayer } from './avatars.js';
import { Decals } from './decals.js';
import { HallAnchorsProvider } from './hall-anchors.js';
import type { SeatPaint } from './paint.js';
import { Room } from './room.js';
import { ScreenSurface } from './screen.js';
import { SeatLayer } from './seats.js';
import type { AvatarOptions, Decal, SeatModelSource } from './types.js';

/**
 * Props of `HallScene`, the scene shared by `SeatView` and `HallPreview`: the layout, the colours,
 * the seat paint, the scene options, the seats that get avatars, and the children to render inside
 * the scene.
 */
export interface HallSceneProps {
  layout: HallLayout;
  colors: SceneColors;
  paint: SeatPaint;
  seatModels?: Record<string, 'procedural' | SeatModelSource>;
  curtains: boolean;
  ceilingLights: boolean;
  decals?: readonly Decal[];
  screen?: ScreenContent;
  onScreenSettled: () => void;
  /** Occupied seats to draw avatars on. */
  taken: readonly Seat[];
  avatars?: Avatars;
  /** `null` hides the avatars. */
  avatarOptions: AvatarOptions | null;
  children?: ReactNode;
}

/** The room, screen, seats and avatars: one tree for the seat view and the preview. */
export function HallScene(props: HallSceneProps): ReactNode {
  const {
    layout,
    colors,
    paint,
    seatModels,
    curtains,
    ceilingLights,
    decals,
    screen,
    onScreenSettled,
  } = props;
  const { taken, avatars, avatarOptions, children } = props;
  const { invalidate } = useThree();
  // New props reach the scene through React, and in "demand" frameloop nothing draws them until a frame is asked for.
  useEffect(() => {
    invalidate();
  }, [
    invalidate,
    layout,
    colors,
    paint,
    seatModels,
    curtains,
    ceilingLights,
    decals,
    taken,
    avatars,
    avatarOptions,
  ]);
  return (
    <HallAnchorsProvider layout={layout}>
      <color attach="background" args={[colors.fog]} />
      <fog attach="fog" args={[colors.fog, 12, 42]} />
      <hemisphereLight args={['#fff1e2', '#1a1210', 0.35]} />
      <Room layout={layout} colors={colors} curtains={curtains} ceilingLights={ceilingLights} />
      <ScreenSurface screen={layout.screen} content={screen} onSettled={onScreenSettled} />
      {decals && decals.length > 0 ? <Decals decals={decals} hall={layout.hall} /> : null}
      <SeatLayer layout={layout} paint={paint} seatModels={seatModels} />
      {avatarOptions ? (
        <AvatarLayer seats={taken} avatars={avatars} options={avatarOptions} />
      ) : null}
      {children}
    </HallAnchorsProvider>
  );
}

/**
 * Calls `onReady` once the screen texture is on screen and a frame has rendered it. `readyRef` is
 * set after
 * the texture is committed. The frame that first sees it is requested with `invalidate()`, and
 * `onReady`
 * runs in the frame after that one: by then the render that shows the texture has happened.
 */
export function ReadyGate({
  readyRef,
  onReady,
}: {
  readyRef: { current: boolean };
  onReady?: () => void;
}): null {
  const { invalidate } = useThree();
  const phase = useRef<'waiting' | 'seen' | 'done'>('waiting');
  const latest = useRef(onReady);
  useEffect(() => {
    latest.current = onReady;
  }, [onReady]);
  useFrame(() => {
    if (phase.current === 'done') return;
    if (phase.current === 'waiting') {
      if (!readyRef.current) return;
      phase.current = 'seen';
      invalidate();
      return;
    }
    phase.current = 'done';
    latest.current?.();
  });
  return null;
}
