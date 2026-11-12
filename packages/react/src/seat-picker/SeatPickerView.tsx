import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { formatLabel } from '../labels/labels.js';
import { partClass } from '../provider/provider.js';
import { SeatView } from '../seat-view/SeatView.js';
import { useRequiredModel } from './use-seat-picker.js';

/** Props of `SeatPickerView`. */
export interface SeatPickerViewProps {
  /** React Three Fiber children, rendered inside the scene (use `useHallAnchors()` to place them). */
  children?: ReactNode;
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M15 5l-7 7 7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/**
 * The 3D layer. It mounts while the view is requested or animating back, so the WebGL context is
 * created on demand (always on desktop). Its blur and opacity follow the crossfade on every frame;
 * it is never blurred at rest.
 * @param props - Props.
 * @param props.children - React Three Fiber children rendered inside the scene.
 * @returns The 3D layer, or `null` while it is not mounted.
 * @example
 * ```tsx
 * <SeatPickerView><MyAnchors /></SeatPickerView>
 * ```
 */
export function SeatPickerView(props: SeatPickerViewProps) {
  const { children } = props;
  const model = useRequiredModel('SeatPickerView');
  const { options, controller, webgl, layout, resolved } = model;
  const layerRef = useRef<HTMLDivElement | null>(null);
  const { setViewEl } = model;
  const setLayer = useCallback(
    (el: HTMLDivElement | null) => {
      layerRef.current = el;
      setViewEl(el);
    },
    [setViewEl],
  );
  // The reset button appears once the viewer has touched the 3D view and looked away.
  const [lookedAway, setLookedAway] = useState(false);

  const crossBlur = resolved.crossfade?.blur ?? 0;
  useEffect(() => {
    const el = layerRef.current;
    if (!el) return undefined;
    const apply = () => {
      const cross = model.desktop ? 1 : controller.phaseValue('crossfade');
      el.style.setProperty('--chk-_blur', `${(crossBlur * (1 - cross)).toFixed(2)}px`);
      el.style.setProperty('--chk-_opacity', String(cross));
    };
    apply();
    return controller.phase('crossfade').subscribe(apply);
  }, [controller, crossBlur, model.viewMounted, model.desktop]);

  if (!model.viewMounted) return null;

  const { Button, Chip } = options.slots;
  const labels = options.labels.picker;
  const displayKey = model.desktop ? model.previewKey : model.seatKey;
  const seat = displayKey !== null ? model.seatByKey.get(displayKey) : undefined;
  const WebglFallback = options.slots.webglFallback;

  return (
    <div
      ref={setLayer}
      data-chk="view-layer"
      className={partClass(options, 'view')}
      style={
        { ['--chk-_blur' as string]: '0px', ['--chk-_opacity' as string]: '0' } as CSSProperties
      }
      onPointerDown={() => setLookedAway(true)}
    >
      {webgl === null ? null : webgl ? (
        <SeatView
          ref={model.seatViewRef}
          layout={layout}
          seatKey={model.cameraKey}
          occupancy={model.occupancy}
          avatars={model.avatars}
          selectedKeys={model.selected}
          screen={model.screen}
          scene={model.scene}
          flight={model.flight}
          onFlight={model.onFlight}
          onReady={() => model.onViewReady(Boolean(layerRef.current?.querySelector('canvas')))}
          interactive
          className="chk-view-canvas"
        >
          {children}
        </SeatView>
      ) : WebglFallback ? (
        <WebglFallback message={formatLabel(labels.webglUnavailable)} />
      ) : (
        <div data-chk="webgl-fallback" role="status">
          {formatLabel(labels.webglUnavailable)}
        </div>
      )}
      <div data-chk="view-header" className={partClass(options, 'viewHeader')}>
        {!model.desktop || model.target === 'view' ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label={formatLabel(labels.back)}
            onClick={model.actions.backToMap}
          >
            <ChevronIcon />
          </Button>
        ) : (
          <span />
        )}
        {seat ? (
          <Chip tone="accent">{formatLabel(labels.viewFrom, { label: seat.label })}</Chip>
        ) : (
          <span />
        )}
        {lookedAway ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label={formatLabel(labels.resetLook)}
            onClick={() => {
              setLookedAway(false);
              model.actions.resetLook();
            }}
          >
            <EyeIcon />
          </Button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
