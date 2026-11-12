// Orbit preview of the whole hall. Props are the public contract; the body shares the scene with SeatView.
import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import type { HallLayout, Occupancy, SeatKey } from '@cinema-hall/core';
import { useResolvedOptions } from '../provider/provider.js';
import { EMPTY_AVATAR, takenSeats } from '../scene/avatar-plan.js';
import { useSceneColors } from '../scene/colors.js';
import { DEFAULT_FOV } from '../scene/math.js';
import { HallScene } from '../scene/hall-scene.js';
import { seatTypeColors, type SeatPaint } from '../scene/paint.js';
import { sameJson, useStable } from '../scene/stable.js';
import type { SceneOptions } from '../scene/types.js';
import { OrbitRig } from './orbit-rig.js';
import { ViewShell } from './view-shell.js';

/**
 * Props of `HallPreview`, an orbit view of the whole hall. Highlights and blocked seats are drawn
 * in their colours. `scene` takes the part of the scene options that the preview uses.
 */
export interface HallPreviewProps {
  layout: HallLayout;
  /** Sections drawn with the danger colour (e.g. sections with validation errors). */
  highlightSections?: readonly string[];
  /** Seats drawn with the accent colour. */
  highlightKeys?: readonly SeatKey[];
  occupancy?: Occupancy;
  scene?: Pick<SceneOptions, 'seatModels' | 'curtains' | 'ceilingLights' | 'maxDpr'>;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

const noop = () => undefined;

/**
 * Orbit preview of the whole hall (used by the constructor).
 *
 * @example
 * ```tsx
 * <HallPreview layout={layout} highlightKeys={['main.r2.s1']} />
 * ```
 */
export function HallPreview(props: HallPreviewProps): ReactNode {
  const { layout, highlightSections, highlightKeys, occupancy, className, style, children } = props;
  const options = useResolvedOptions();
  const scene = useStable(props.scene, sameJson);
  const rootRef = useRef<HTMLDivElement>(null);
  const { colors, danger } = useSceneColors(rootRef, options.theme);

  const selected = useMemo(() => new Set<SeatKey>(highlightKeys ?? []), [highlightKeys]);
  const dangerSections = useMemo(
    () => new Set<string>(highlightSections ?? []),
    [highlightSections],
  );
  const blocked = useMemo(() => new Set<SeatKey>(occupancy?.blocked ?? []), [occupancy?.blocked]);
  const themeSeatColors = useMemo(() => seatTypeColors(options.theme), [options.theme]);
  const paint = useMemo<SeatPaint>(
    () => ({ accent: colors.accent, danger, selected, dangerSections, blocked, themeSeatColors }),
    [colors.accent, danger, selected, dangerSections, blocked, themeSeatColors],
  );
  const taken = useMemo(() => takenSeats(layout, occupancy, null), [layout, occupancy]);

  return (
    <ViewShell
      options={options}
      rootRef={rootRef}
      dataChk="preview"
      className={['chk-hall-preview', className].filter(Boolean).join(' ')}
      style={style}
      maxDpr={scene?.maxDpr ?? 2}
      fov={DEFAULT_FOV}
    >
      <HallScene
        layout={layout}
        colors={colors}
        paint={paint}
        seatModels={scene?.seatModels}
        curtains={scene?.curtains ?? true}
        ceilingLights={scene?.ceilingLights ?? true}
        onScreenSettled={noop}
        taken={taken}
        avatarOptions={EMPTY_AVATAR}
      >
        <OrbitRig layout={layout} />
        {children}
      </HallScene>
    </ViewShell>
  );
}
