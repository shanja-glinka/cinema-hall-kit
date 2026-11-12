import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { EasingDefinition } from 'motion/react';
import type { SeatKey } from '@cinema-hall/core';
import type { FlightOptions } from '../scene/types.js';
import type { FlightEvent } from '../seat-view/SeatView.js';
import { TransitionController, type TransitionProgress } from '../transitions/controller.js';
import type { Easing } from '../transitions/easing.js';
import type { PhaseName } from '../transitions/presets.js';
import {
  findPhase,
  type Direction,
  type ResolvedTransition,
  type Target,
  type TransitionEvent,
} from '../transitions/timeline.js';
import type { TransitionEventInfo } from './types.js';

/** A stuck camera must not trap navigation. Timing out resumes the clock with the sheet closed. */
export const LANDING_TIMEOUT_MS = 2000;
const GATE_EPSILON = 1e-6;

/** Open animation of the sheet. */
export interface SheetTween {
  /** Seconds, as react-modal-sheet expects. */
  duration: number;
  ease: EasingDefinition | ((t: number) => number);
}

const MOTION_NAMED: Record<string, EasingDefinition> = {
  linear: 'linear',
  easeIn: 'easeIn',
  easeOut: 'easeOut',
  easeInOut: 'easeInOut',
  easeInOutCubic: [0.65, 0, 0.35, 1],
};

function sheetEase(source: Easing): SheetTween['ease'] {
  if (typeof source === 'string') return MOTION_NAMED[source] ?? 'easeOut';
  if (typeof source === 'function') return source;
  return [source[0], source[1], source[2], source[3]];
}

/** What the orchestrator hands to the picker model. */
export interface TransitionOrchestrator {
  controller: TransitionController;
  phases: Record<PhaseName, TransitionProgress>;
  transition: { phase: PhaseName | null; direction: Direction | null };
  cameraKey: SeatKey | null;
  flight: FlightOptions | false;
  sheetOpen: boolean;
  sheetInstant: boolean;
  sheetTween: SheetTween | undefined;
  viewMounted: boolean;
  onFlight(event: FlightEvent): void;
  onReady(available: boolean): void;
}

/** Input of `useTransitionOrchestrator`. */
export interface OrchestratorInput {
  resolved: ResolvedTransition;
  initialTarget: Target;
  target: Target;
  seatKey: SeatKey | null;
  webgl: boolean | null;
  onTransition: ((event: TransitionEventInfo) => void) | undefined;
}

interface CameraCommand {
  key: SeatKey | null;
  duration: number | null;
}

/**
 * Owns the reversible clock, destination-specific camera commands, landing gate and sheet.
 * @param input - Resolved timeline, goal, seat and WebGL availability.
 * @returns The controller, the camera command, and the sheet state.
 * @example
 * ```tsx
 * const orchestrator = useTransitionOrchestrator({ resolved, initialTarget, target, seatKey, webgl, onTransition });
 * ```
 */
export function useTransitionOrchestrator(input: OrchestratorInput): TransitionOrchestrator {
  const { resolved, initialTarget, target, seatKey, webgl, onTransition } = input;
  const [transition, setTransition] = useState<{
    phase: PhaseName | null;
    direction: Direction | null;
  }>({ phase: null, direction: null });
  const [command, setCommand] = useState<CameraCommand>({
    key: initialTarget === 'view' ? seatKey : null,
    duration: null,
  });
  const activeCommand = useRef(command);
  const [sheetOpen, setSheetOpen] = useState(initialTarget === 'view');
  const [sheetFirstOpen, setSheetFirstOpen] = useState(initialTarget === 'view');
  const [viewMounted, setViewMounted] = useState(initialTarget === 'view');
  const [holding, setHolding] = useState(false);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const landed = useRef(initialTarget === 'view');
  // The camera reports every flight through its newest callback, so an interrupted flight's `end`
  // arrives looking like the current command's. A flight belongs to the current command only after
  // its own `start`, which the camera always emits after it has closed the previous flight.
  const flightStarted = useRef(initialTarget === 'view');

  const cameraPhase = findPhase(resolved, 'cameraFlight');
  const needsLanding = Boolean(
    cameraPhase &&
    cameraPhase.duration > 0 &&
    resolved.flight &&
    webgl !== false &&
    !cameraUnavailable,
  );
  const canOpenSheet = () => !needsLanding || landed.current;

  const commandCamera = (key: SeatKey | null) => {
    if (activeCommand.current.key === key) return;
    const at = controller.clock.time;
    const duration =
      cameraPhase && resolved.flight
        ? key === null
          ? Math.max(0, Math.min(at, cameraPhase.end) - cameraPhase.start) / resolved.reverseSpeed
          : Math.max(0, cameraPhase.end - at)
        : null;
    const next = { key, duration };
    landed.current = !needsLanding;
    flightStarted.current = false;
    activeCommand.current = next;
    setCommand(next);
    setSheetFirstOpen(false);
    setSheetOpen(false);
  };

  const onEvents = (events: TransitionEvent[]) => {
    for (const event of events) {
      onTransition?.({ phase: event.phase, direction: event.direction, state: event.state });
      if (event.state !== 'start') continue;
      setTransition({ phase: event.phase, direction: event.direction });
      if (event.phase === 'cameraFlight')
        commandCamera(event.direction === 'forward' ? seatKey : null);
      if (event.phase === 'sheetIn') setSheetOpen(event.direction === 'forward' && canOpenSheet());
    }
  };

  const onSettled = (reached: Target) => {
    setTransition({ phase: null, direction: null });
    setHolding(false);
    if (reached === 'view') {
      if (!resolved.flight || cameraPhase?.duration === 0) commandCamera(seatKey);
      setSheetOpen(canOpenSheet());
    } else {
      commandCamera(null);
      setSheetOpen(false);
      setViewMounted(false);
    }
  };
  const onHold = () => {
    if (canOpenSheet()) controller.release();
    else setHolding(true);
  };
  const acceptFlight = (event: FlightEvent, source: CameraCommand) => {
    if (
      source !== activeCommand.current ||
      source.key !== seatKey ||
      target !== 'view' ||
      event.direction !== 'to-seat'
    )
      return;
    if (event.state === 'start') {
      flightStarted.current = true;
      return;
    }
    // Before the current command's own start, an `end` is the previous flight finishing or being cut.
    if (event.state !== 'end' || !flightStarted.current) return;
    if (event.progress !== 1) {
      landed.current = false;
      setSheetOpen(false);
      return;
    }
    land();
  };
  const land = () => {
    landed.current = true;
    setHolding(false);
    if (controller.clock.held) controller.release();
    if (controller.clock.arrived) setSheetOpen(true);
  };
  // A Canvas that mounts after the command starts at the seat: no flight, no flight events. Its
  // readiness is then the landing. During a flight of the current command readiness means nothing.
  const ready = (available: boolean) => {
    if (!available) {
      setCameraUnavailable(true);
      return;
    }
    if (target !== 'view' || seatKey === null) return;
    // `command` is the one the mounted camera has been rendered with; a newer one is not seen yet.
    if (command !== activeCommand.current || command.key !== seatKey || flightStarted.current)
      return;
    land();
  };
  const giveUp = () => {
    setHolding(false);
    // Releasing the timing gate is not evidence of a completed landing.
    controller.release();
  };

  const latest = useRef({ onEvents, onSettled, onHold, acceptFlight, giveUp, ready });
  useLayoutEffect(() => {
    latest.current = { onEvents, onSettled, onHold, acceptFlight, giveUp, ready };
  });
  const controller = useMemo(
    () =>
      new TransitionController(resolved, initialTarget, {
        onEvents: (events) => latest.current.onEvents(events),
        onSettled: (reached) => latest.current.onSettled(reached),
        onHold: () => latest.current.onHold(),
      }),
    [resolved, initialTarget],
  );
  useEffect(() => {
    controller.attach();
    return () => controller.dispose();
  }, [controller]);
  useEffect(() => {
    if (!holding) return undefined;
    const id = setTimeout(() => latest.current.giveUp(), LANDING_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [holding, command]);

  const startGoto = useEffectEvent(() => {
    const clock = controller.clock;
    if (target === 'map') {
      setSheetOpen(false);
      setSheetFirstOpen(false);
      commandCamera(null);
    } else {
      setViewMounted(true);
      // Mount the overview before the first flight. Retarget an existing flight at once.
      if (
        !resolved.flight ||
        (viewMounted && cameraPhase && clock.time >= cameraPhase.start) ||
        activeCommand.current.key !== null ||
        clock.time > 0
      )
        commandCamera(seatKey);
    }
    const landingAt = cameraPhase && needsLanding && !landed.current ? cameraPhase.end : null;
    // A seat change after the camera phase still waits at the current position.
    controller.setGate(
      target === 'view' && landingAt !== null
        ? Math.max(clock.time, landingAt - GATE_EPSILON)
        : null,
    );
    controller.goto(target);
    if (clock.direction !== null)
      setTransition((previous) => ({ ...previous, direction: clock.direction }));
  });
  useEffect(() => {
    startGoto();
  }, [controller, target, seatKey]);

  const noCamera = useEffectEvent(() => {
    if (webgl !== false && !cameraUnavailable) return;
    landed.current = true;
    setHolding(false);
    controller.release();
    if (target === 'view' && controller.clock.arrived) setSheetOpen(true);
  });
  useEffect(() => {
    noCamera();
  }, [controller, webgl, cameraUnavailable]);

  const phases = useMemo(
    () => ({
      mapZoom: controller.phase('mapZoom'),
      crossfade: controller.phase('crossfade'),
      cameraFlight: controller.phase('cameraFlight'),
      sheetIn: controller.phase('sheetIn'),
    }),
    [controller],
  );
  const flight = useMemo<FlightOptions | false>(
    () =>
      resolved.flight
        ? {
            ...resolved.flight,
            duration: command.duration ?? resolved.flight.duration,
          }
        : false,
    [resolved, command.duration],
  );
  const sheetTween = useMemo<SheetTween | undefined>(() => {
    const spec = findPhase(resolved, 'sheetIn');
    return spec ? { duration: spec.duration / 1000, ease: sheetEase(spec.source) } : undefined;
  }, [resolved]);

  return {
    controller,
    phases,
    transition,
    cameraKey: command.key,
    flight,
    sheetOpen,
    sheetInstant:
      resolved.motion !== 'full' || sheetFirstOpen || !sheetTween || sheetTween.duration <= 0,
    sheetTween,
    viewMounted,
    onFlight: (event) => latest.current.acceptFlight(event, command),
    onReady: (available) => latest.current.ready(available),
  };
}
