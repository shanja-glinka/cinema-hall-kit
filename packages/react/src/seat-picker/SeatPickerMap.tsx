import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { partClass } from '../provider/provider.js';
import { SeatMap } from '../seat-map/SeatMap.js';
import { buildMapGeometry, originPercent } from '../seat-map/geometry.js';
import { useRequiredModel } from './use-seat-picker.js';

/**
 * The 2D map layer. Zoom, fade and blur are written to CSS variables on every transition frame,
 * so the map does not re-render while it animates.
 * @returns The map layer.
 * @example
 * ```tsx
 * <SeatPickerMap />
 * ```
 */
export function SeatPickerMap() {
  const model = useRequiredModel('SeatPickerMap');
  const { options, state, layout, controller, resolved } = model;
  const layerRef = useRef<HTMLDivElement | null>(null);
  const geometry = useMemo(() => buildMapGeometry(layout), [layout]);

  const zoomKey =
    model.seatKey ?? state.focusKey ?? model.selected[model.selected.length - 1] ?? null;
  const origin = zoomKey !== null ? originPercent(geometry, zoomKey) : null;

  const mapZoom = resolved.mapZoom;
  const desktop = model.desktop;
  useEffect(() => {
    const el = layerRef.current;
    if (!el) return undefined;
    const apply = () => {
      const zoom = !desktop && mapZoom ? controller.phaseValue('mapZoom') : 0;
      const cross = desktop ? 0 : controller.phaseValue('crossfade');
      const maxScale = mapZoom?.maxScale ?? 1;
      const blur = mapZoom?.blur ?? 0;
      el.style.setProperty('--chk-_zoom', String(zoom));
      el.style.setProperty('--chk-_scale', String(1 + (maxScale - 1) * zoom));
      el.style.setProperty('--chk-_blur', `${(blur * zoom * (1 - cross)).toFixed(2)}px`);
      el.style.setProperty('--chk-_opacity', String(1 - cross));
      el.style.visibility = cross >= 1 ? 'hidden' : '';
    };
    apply();
    const offZoom = controller.phase('mapZoom').subscribe(apply);
    const offCross = controller.phase('crossfade').subscribe(apply);
    return () => {
      offZoom();
      offCross();
    };
  }, [controller, mapZoom, desktop]);

  const typeColors: Record<string, string> = {};
  for (const [id, value] of Object.entries(options.theme.seatTypes ?? {})) {
    if (value.fill) typeColors[id] = value.fill;
  }

  const style = {
    ['--chk-_ox' as string]: `${origin?.x ?? 50}%`,
    ['--chk-_oy' as string]: `${origin?.y ?? 50}%`,
  } as CSSProperties;

  return (
    <div
      ref={layerRef}
      data-chk="map-layer"
      className={partClass(options, 'map')}
      inert={model.target === 'view'}
      style={style}
    >
      <SeatMap
        layout={layout}
        status={model.effectiveStatus}
        priceOf={model.priceOf}
        formatPrice={options.formatPrice}
        selected={model.selected}
        focusKey={state.focusKey}
        inert={model.inert}
        typeColors={typeColors}
        labels={options.labels.picker}
        classNames={options.classNames}
        SeatSlot={options.slots.seat}
        onFocusSeat={model.actions.focus}
        onActivate={model.actions.activate}
      />
    </div>
  );
}
