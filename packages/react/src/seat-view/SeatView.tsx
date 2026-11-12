// The 3D view from a seat. Props and handle are the public contract; the body lives in ../scene.
import {
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';
import type { Avatars, HallLayout, Occupancy, ScreenContent, SeatKey } from '@cinema-hall/core';
import { useResolvedOptions } from '../provider/provider.js';
import { avatarOptionsOf, takenSeats } from '../scene/avatar-plan.js';
import { useSceneColors } from '../scene/colors.js';
import { CameraRig, type LookControls } from '../scene/camera-rig.js';
import {
  DEFAULT_FLIGHT_MS,
  DEFAULT_FOV,
  DEFAULT_PITCH_RANGE,
  DEFAULT_YAW_RANGE,
} from '../scene/math.js';
import { HallScene, ReadyGate } from '../scene/hall-scene.js';
import { seatTypeColors, type SeatPaint } from '../scene/paint.js';
import { sameScene, useStable } from '../scene/stable.js';
import type { FlightOptions, SceneOptions } from '../scene/types.js';
import { ViewShell } from './view-shell.js';

/** Imperative handle of `SeatView`, given through its `ref`. */
export interface SeatViewHandle {
  /** Turns the camera back to the centre of the screen (animated). */
  resetLook(): void;
}

/**
 * Camera flight event, reported through `onFlight`. A flight starts with `start`, reports
 * `progress` while it runs, and ends with `end`. When a new seat interrupts a flight, `end` reports
 * the progress reached so far.
 */
export interface FlightEvent {
  state: 'start' | 'progress' | 'end';
  /** Time progress of the flight, 0…1 (not eased). */
  progress: number;
  /** `to-seat` when `seatKey` became a seat, `to-overview` when it became null. */
  direction: 'to-seat' | 'to-overview';
}

/**
 * Props of `SeatView`. Changing `seatKey` flies the camera to that seat's eye point, or to the
 * overview when it is `null`.
 */
export interface SeatViewProps {
  layout: HallLayout;
  /** Camera position: the eye point of this seat, or the overview pose when `null`. Changes fly. */
  seatKey: SeatKey | null;
  occupancy?: Occupancy;
  avatars?: Avatars;
  /** Highlighted (accent) seats. */
  selectedKeys?: readonly SeatKey[];
  screen?: ScreenContent;
  scene?: SceneOptions;
  /** `false` jumps without animation (reduced motion). */
  flight?: FlightOptions | false;
  onFlight?: (event: FlightEvent) => void;
  /**
   * Once: after the first frame rendered with the screen content settled (loaded or failed). When
   * WebGL is
   * unavailable it is called once as well (no frame will ever render), so hosts never wait forever.
   */
  onReady?: () => void;
  /** Look-around with drag/gyro. Default true. */
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
  /**
   * React Three Fiber children rendered inside the scene (use `useHallAnchors()` to place them).
   */
  children?: ReactNode;
  /** Handle for imperative calls, such as `resetLook()`. */
  ref?: Ref<SeatViewHandle>;
}

const DEFAULT_FLIGHT: FlightOptions = { duration: DEFAULT_FLIGHT_MS, ease: 'easeInOutCubic' };
const NO_SECTIONS: ReadonlySet<string> = new Set();

/**
 * The 3D view from a seat: the hall, its seats, avatars and screen, and a camera that flies between
 * seats and can be looked around. Without WebGL, the `webglFallback` slot or a message is shown
 * instead. Theme and labels come from the provider when there is one, and from the defaults
 * otherwise.
 *
 * @example
 * ```tsx
 * <SeatView
 *   layout={layout}
 *   seatKey="main.r2.s1"
 *   occupancy={occupancy}
 *   onFlight={(e) => console.log(e.state)}
 * />
 * ```
 */
export function SeatView(props: SeatViewProps): ReactNode {
  const { layout, seatKey, occupancy, avatars, selectedKeys, screen, flight, onFlight, onReady } =
    props;
  const { interactive = true, className, style, children } = props;
  const options = useResolvedOptions();
  const scene = useStable(props.scene, sameScene);
  const rootRef = useRef<HTMLDivElement>(null);
  const controls = useRef<LookControls | null>(null);
  const readyRef = useRef(false);
  // One guard for both paths (first rendered frame, or WebGL failing later): onReady fires once per mount.
  const notifiedRef = useRef(false);
  const latestOnReady = useRef(onReady);
  useLayoutEffect(() => {
    latestOnReady.current = onReady;
  });
  const readyOnce = useCallback(() => {
    if (notifiedRef.current) return;
    notifiedRef.current = true;
    latestOnReady.current?.();
  }, []);

  useImperativeHandle(
    props.ref,
    () => ({
      resetLook: () => controls.current?.resetLook(),
    }),
    [],
  );

  const { colors, danger } = useSceneColors(rootRef, options.theme);
  const selected = useMemo(() => new Set<SeatKey>(selectedKeys ?? []), [selectedKeys]);
  const blocked = useMemo(() => new Set<SeatKey>(occupancy?.blocked ?? []), [occupancy?.blocked]);
  const themeSeatColors = useMemo(() => seatTypeColors(options.theme), [options.theme]);
  const paint = useMemo<SeatPaint>(
    () => ({
      accent: colors.accent,
      danger,
      selected,
      dangerSections: NO_SECTIONS,
      blocked,
      themeSeatColors,
    }),
    [colors.accent, danger, selected, blocked, themeSeatColors],
  );
  const taken = useMemo(() => takenSeats(layout, occupancy, seatKey), [layout, occupancy, seatKey]);
  const avatarOptions = useMemo(() => avatarOptionsOf(scene?.avatar), [scene?.avatar]);
  const onScreenSettled = useCallback(() => {
    readyRef.current = true;
  }, []);

  const camera = scene?.camera;
  const fov = camera?.fov ?? DEFAULT_FOV;
  const maxDpr = scene?.maxDpr ?? 2;

  return (
    <ViewShell
      options={options}
      rootRef={rootRef}
      dataChk="view"
      className={className}
      style={style}
      maxDpr={maxDpr}
      fov={fov}
      onUnavailable={readyOnce}
    >
      <HallScene
        layout={layout}
        colors={colors}
        paint={paint}
        seatModels={scene?.seatModels}
        curtains={scene?.curtains ?? true}
        ceilingLights={scene?.ceilingLights ?? true}
        decals={scene?.decals}
        screen={screen}
        onScreenSettled={onScreenSettled}
        taken={taken}
        avatars={avatars}
        avatarOptions={avatarOptions}
      >
        <CameraRig
          layout={layout}
          seatKey={seatKey}
          flight={flight === undefined ? DEFAULT_FLIGHT : flight}
          interactive={interactive}
          gyro={camera?.gyro ?? false}
          yawRange={camera?.look?.yaw ?? DEFAULT_YAW_RANGE}
          pitchRange={camera?.look?.pitch ?? DEFAULT_PITCH_RANGE}
          fov={fov}
          maxDpr={maxDpr}
          onFlight={onFlight}
          controls={controls}
        />
        <ReadyGate readyRef={readyRef} onReady={readyOnce} />
        {children}
      </HallScene>
    </ViewShell>
  );
}
