import { useCallback, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from 'three';
import type { HallLayout, SeatKey } from '@cinema-hall/core';
import type { FlightEvent } from '../seat-view/SeatView.js';
import {
  applyLook,
  clampAngle,
  copyPose,
  degToRad,
  flightDpr,
  poseForSeat,
  restoredDpr,
} from './math.js';
import {
  flightProgress,
  planFlight,
  sampleFlight,
  type FlightDirection,
  type FlightPlan,
} from './flight.js';
import {
  clearGyro,
  clearLook,
  dragLook,
  freshLook,
  gyroLook,
  GYRO_GAIN,
  startReset,
  stepLook,
  type LookState,
} from './look.js';
import type { CameraPose, FlightOptions } from './types.js';

/** Handle the rig gives to `SeatView` for `resetLook()`. */
export interface LookControls {
  resetLook(): void;
}

/**
 * Props of `CameraRig`. Look ranges are in degrees, relative to the direction of the screen centre.
 * `flight: false` jumps without animation.
 */
export interface CameraRigProps {
  layout: HallLayout;
  seatKey: SeatKey | null;
  flight: FlightOptions | false;
  interactive: boolean;
  gyro: boolean;
  /** Look ranges in degrees, relative to the direction of the screen centre. */
  yawRange: readonly [number, number];
  pitchRange: readonly [number, number];
  fov: number;
  maxDpr: number;
  onFlight?: (event: FlightEvent) => void;
  controls: { current: LookControls | null };
}

interface Drag {
  id: number;
  x: number;
  y: number;
}

/**
 * The camera of the seat view: flies between poses (interruptible), applies the look-around while
 * seated, and keeps the device pixel ratio low during flights. Everything runs in `useFrame`, so
 * the
 * canvas only renders while something moves (frameloop "demand").
 */
export function CameraRig(props: CameraRigProps): null {
  const { layout, seatKey, controls, fov, gl, invalidate, camera, setDpr, dpr } =
    useCameraRigContext(props);
  const latest = useRef(props);
  const pose = useRef<CameraPose | null>(null);
  const plan = useRef<FlightPlan | null>(null);
  const atSeat = useRef<SeatKey | null>(null);
  const look = useRef<LookState>(freshLook());
  const applied = useRef({ yaw: 0, pitch: 0 });
  const drag = useRef<Drag | null>(null);
  // The ratio R3F renders with, and the ratio a lowered flight restores (null while nothing is lowered).
  const currentDpr = useRef(dpr);
  const restoreDpr = useRef<number | null>(null);
  // The scale a lowered flight applies to the ratio it started from.
  const loweredScale = useRef(1);

  useEffect(() => {
    latest.current = props;
    currentDpr.current = dpr;
  });

  // The ratio goes through R3F's state, so that R3F's resize keeps it and the bounds of [1, maxDpr] hold.
  const applyDpr = useCallback(
    (value: number) => {
      currentDpr.current = value;
      setDpr(value);
    },
    [setDpr],
  );

  const endLoweredDpr = useCallback(() => {
    const base = restoreDpr.current;
    if (base === null) return;
    restoreDpr.current = null;
    // The ratio the flight started from, within the maxDpr that holds now (it may have changed in the flight).
    applyDpr(restoredDpr(base, latest.current.maxDpr));
  }, [applyDpr]);

  const cancelDrag = useCallback(() => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    try {
      gl.domElement.releasePointerCapture(active.id);
    } catch {
      // The pointer was not captured: nothing to release.
    }
  }, [gl]);

  const finishFlight = useCallback(
    (now: number, reached: boolean) => {
      const current = plan.current;
      if (!current) return;
      const progress = reached ? 1 : flightProgress(current, now);
      plan.current = null;
      endLoweredDpr();
      latest.current.onFlight?.({ state: 'end', progress, direction: current.direction });
    },
    [endLoweredDpr],
  );

  useEffect(() => {
    if (camera instanceof PerspectiveCamera) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    invalidate();
  }, [camera, fov, invalidate]);

  // A new seat (or a new layout) starts from the pose the camera has now.
  useEffect(() => {
    const now = performance.now();
    const options = latest.current;
    const target = poseForSeat(layout, seatKey);
    const nextAt = target.atSeat ? seatKey : null;
    const previousAt = atSeat.current;
    const from =
      pose.current !== null && previousAt !== null
        ? applyLook(pose.current, applied.current.yaw, applied.current.pitch)
        : pose.current;
    const changed = previousAt !== nextAt;
    // A drag belongs to the seat it started at: a new seat or a flight ends it.
    cancelDrag();
    clearLook(look.current);
    atSeat.current = nextAt;
    finishFlight(now, false);

    if (pose.current === null || !changed) {
      pose.current = copyPose(target.pose);
      invalidate();
      return;
    }

    const direction: FlightDirection = nextAt === null ? 'to-overview' : 'to-seat';
    const flightOptions = options.flight;
    if (flightOptions === false) {
      pose.current = copyPose(target.pose);
      options.onFlight?.({ state: 'start', progress: 0, direction });
      options.onFlight?.({ state: 'end', progress: 1, direction });
      invalidate();
      return;
    }

    plan.current = planFlight(from ?? target.pose, target.pose, now, {
      layout,
      direction,
      duration: flightOptions.duration,
      ease: flightOptions.ease,
      arcHeight: flightOptions.arcHeight,
      path: flightOptions.path,
    });
    const scale = flightOptions.lowResScale;
    if (scale !== undefined && scale < 1) {
      // A flight during a flight keeps the ratio of the first one as its base.
      restoreDpr.current = restoreDpr.current ?? currentDpr.current;
      loweredScale.current = scale;
      applyDpr(flightDpr(restoreDpr.current, scale, options.maxDpr));
    }
    options.onFlight?.({ state: 'start', progress: 0, direction });
    invalidate();
  }, [layout, seatKey, finishFlight, invalidate, cancelDrag, applyDpr]);

  // Gyro offsets follow the option: turning it off forgets them.
  const gyroOn = props.gyro && props.interactive;
  useEffect(() => {
    if (!gyroOn) clearGyro(look.current);
  }, [gyroOn]);

  // Look-around by pointer (and gyro after a user gesture, where the platform asks for permission).
  useEffect(() => {
    if (!props.interactive) return;
    const element = gl.domElement;
    element.style.touchAction = 'none';
    let gyroRequested = false;
    let gyroAttached = false;
    let disposed = false;

    const onOrientation = (event: DeviceOrientationEvent) => {
      // Gated on the option: a listener that outlives `gyro: false` must not move the view.
      if (disposed || !latest.current.gyro) return;
      if (event.gamma === null || event.beta === null) return;
      gyroLook(look.current, event.gamma, event.beta, GYRO_GAIN);
      if (atSeat.current !== null) invalidate();
    };
    const attachGyro = () => {
      // A permission that resolves after unmount, or after `gyro` was turned off, attaches nothing.
      if (disposed || gyroAttached || !latest.current.gyro) return;
      gyroAttached = true;
      window.addEventListener('deviceorientation', onOrientation);
    };
    const requestGyro = () => {
      if (gyroRequested || !latest.current.gyro) return;
      gyroRequested = true;
      const orientation = (
        window as unknown as {
          DeviceOrientationEvent?: { requestPermission?: () => Promise<string> };
        }
      ).DeviceOrientationEvent;
      if (typeof orientation?.requestPermission === 'function') {
        orientation
          .requestPermission()
          .then((state) => {
            if (state === 'granted') attachGyro();
          })
          .catch(() => undefined);
      } else {
        attachGyro();
      }
    };

    const onDown = (event: PointerEvent) => {
      if (atSeat.current === null || plan.current !== null) return;
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is an enhancement; dragging still works without it.
      }
      look.current.tween = null;
      requestGyro();
    };
    const onMove = (event: PointerEvent) => {
      const active = drag.current;
      if (!active || event.pointerId !== active.id) return;
      // Only a seated view turns, and never while a flight moves the camera.
      if (atSeat.current === null || plan.current !== null) {
        cancelDrag();
        return;
      }
      const dx = event.clientX - active.x;
      const dy = event.clientY - active.y;
      active.x = event.clientX;
      active.y = event.clientY;
      const options = latest.current;
      dragLook(
        look.current,
        dx,
        dy,
        [degToRad(options.yawRange[0]), degToRad(options.yawRange[1])],
        [degToRad(options.pitchRange[0]), degToRad(options.pitchRange[1])],
      );
      invalidate();
    };
    const onUp = (event: PointerEvent) => {
      if (drag.current && event.pointerId === drag.current.id) drag.current = null;
    };

    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onUp);
    return () => {
      disposed = true;
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onUp);
      if (gyroAttached) window.removeEventListener('deviceorientation', onOrientation);
      gyroAttached = false;
      cancelDrag();
      element.style.touchAction = '';
    };
  }, [props.interactive, props.gyro, gl, invalidate, cancelDrag]);

  useEffect(() => {
    controls.current = {
      resetLook: () => {
        startReset(look.current, performance.now());
        invalidate();
      },
    };
    return () => {
      controls.current = null;
    };
  }, [controls, invalidate]);

  // Unmounting during a lowered flight gives back the ratio R3F had.
  useEffect(() => () => endLoweredDpr(), [endLoweredDpr]);

  useFrame((state) => {
    const now = performance.now();
    const options = latest.current;
    const running = plan.current;
    if (running) {
      const sample = sampleFlight(running, now);
      pose.current = sample.pose;
      if (sample.done) {
        finishFlight(now, true);
      } else {
        options.onFlight?.({
          state: 'progress',
          progress: sample.progress,
          direction: running.direction,
        });
        invalidate();
      }
    }
    // R3F resets the ratio to the Canvas value on a resize, and when devicePixelRatio changes: a lowered flight
    // puts its own ratio back, within the maxDpr that holds now.
    if (restoreDpr.current !== null) {
      const wanted = flightDpr(restoreDpr.current, loweredScale.current, options.maxDpr);
      if (state.viewport.dpr !== wanted) applyDpr(wanted);
    }
    const base = pose.current;
    if (!base) return;

    const moving = stepLook(look.current, now);
    const lookActive = atSeat.current !== null && plan.current === null;
    let yaw = 0;
    let pitch = 0;
    if (lookActive) {
      yaw = clampAngle(
        look.current.yaw + look.current.gyroYaw,
        degToRad(options.yawRange[0]),
        degToRad(options.yawRange[1]),
      );
      pitch = clampAngle(
        look.current.pitch + look.current.gyroPitch,
        degToRad(options.pitchRange[0]),
        degToRad(options.pitchRange[1]),
      );
    }
    applied.current = { yaw, pitch };
    const view = lookActive ? applyLook(base, yaw, pitch) : base;
    camera.position.set(base.position.x, base.position.y, base.position.z);
    camera.lookAt(view.target.x, view.target.y, view.target.z);
    if (moving) invalidate();
  });

  return null;
}

/** Everything the rig reads from React Three Fiber, in one place. */
function useCameraRigContext(props: CameraRigProps) {
  const { camera, gl, invalidate, setDpr, viewport } = useThree();
  return {
    layout: props.layout,
    seatKey: props.seatKey,
    controls: props.controls,
    fov: props.fov,
    gl,
    invalidate,
    camera,
    setDpr,
    dpr: viewport.dpr,
  };
}
