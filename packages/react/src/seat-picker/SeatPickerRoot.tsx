import { useEffect, useEffectEvent } from 'react';
import { ChkScope, rootProps } from '../provider/provider.js';
import { usePickerModel } from './use-picker-model.js';
import { PickerContext } from './use-seat-picker.js';
import type { SeatPickerRootProps } from './types.js';

/**
 * Owns the picker state (selection, view, transition, booking) and provides it to the parts.
 * Renders the root element; the parts are passed as children. At a root width of 1024 px or more
 * the parts arrange themselves side by side (map, live 3D view and a details panel).
 * @param props - Root props.
 * @returns The root element.
 * @example
 * ```tsx
 * <SeatPickerRoot layout={layout} occupancy={occupancy}>
 *   <SeatPickerMap />
 *   <SeatPickerView />
 *   <SeatPickerSheet />
 *   <SeatPickerFooter />
 * </SeatPickerRoot>
 * ```
 */
export function SeatPickerRoot<TData = unknown>(props: SeatPickerRootProps<TData>) {
  const model = usePickerModel(props);
  const collapse = useEffectEvent(() => model.actions.backToMap());
  useEffect(() => {
    if (!model.desktop || model.target !== 'view' || !model.rootEl) return undefined;
    const root = model.rootEl;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        collapse();
      }
    };
    root.addEventListener('keydown', onKeyDown);
    return () => root.removeEventListener('keydown', onKeyDown);
  }, [model.desktop, model.target, model.rootEl]);
  // Quality 'low' and reduced motion drop the blur of the 3D layer (the dim blur included).
  const noBlur = model.resolved.quality === 'low' || model.resolved.motion !== 'full';
  return (
    <ChkScope value={model.options}>
      <PickerContext.Provider value={model}>
        <div
          ref={model.setRootEl}
          {...rootProps(model.options, {
            className: props.className,
            style: props.style,
            layout: model.layoutMode,
          })}
          data-chk="root"
          data-chk-desktop={model.desktop ? '' : undefined}
          data-chk-narrow={model.narrow ? '' : undefined}
          data-chk-sheet-open={!model.desktop && model.sheetOpen ? '' : undefined}
          data-chk-transitioning={model.transition.direction !== null ? '' : undefined}
          data-stage={model.target}
          data-phase={model.transition.phase ?? undefined}
          data-chk-quality={noBlur ? 'low' : undefined}
        >
          {props.children}
        </div>
      </PickerContext.Provider>
    </ChkScope>
  );
}
