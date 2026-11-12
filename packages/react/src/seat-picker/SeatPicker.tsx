import { SeatPickerRoot } from './SeatPickerRoot.js';
import { SeatPickerMap } from './SeatPickerMap.js';
import { SeatPickerView, type SeatPickerViewProps } from './SeatPickerView.js';
import { SeatPickerSheet } from './SeatPickerSheet.js';
import { SeatPickerFooter } from './Footer.js';
import type { SeatPickerRootProps } from './types.js';

/** Props of `SeatPicker`: the root props plus the 3D layer content. */
export type SeatPickerProps<TData = unknown> = SeatPickerRootProps<TData> & {
  /** Content of the 3D layer: React Three Fiber children. */
  viewChildren?: SeatPickerViewProps['children'];
};

/**
 * The complete seat picker: map, 3D view, glass sheet and footer, composed from the parts.
 * For a custom layout use `SeatPickerRoot` with the parts yourself.
 * @param props - Root props.
 * @param props.viewChildren - Content of the 3D layer.
 * @param props.children - Ignored: the picker composes its own parts.
 * @returns The picker.
 * @example
 * ```tsx
 * <SeatPicker config={config} occupancy={occupancy} onBook={book} />
 * ```
 */
export function SeatPicker<TData = unknown>(props: SeatPickerProps<TData>) {
  const { viewChildren, children: _children, ...rootProps } = props;
  return (
    <SeatPickerRoot<TData> {...rootProps}>
      <SeatPickerMap />
      <SeatPickerView>{viewChildren}</SeatPickerView>
      <SeatPickerSheet />
      <SeatPickerFooter />
    </SeatPickerRoot>
  );
}
