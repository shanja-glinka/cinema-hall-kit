// Public API of @cinema-hall/react. Everything not re-exported here is internal.
// Core types are re-exported so hosts can import everything from one package.
export type * from '@cinema-hall/core';

export {
  CinemaHallProvider,
  type CinemaHallOptions,
  type ClassNames,
  type PartName,
} from './provider/provider.js';
export {
  labels,
  formatLabel,
  type Label,
  type Labels,
  type PickerLabels,
  type DeepPartial,
} from './labels/labels.js';
export type { EditorLabels } from './labels/editor-labels.js';
export {
  themes,
  themeToCss,
  themeToStyle,
  SEED_TOKENS,
  SEMANTIC_TOKENS,
  type Theme,
  type TokenName,
  type SeedToken,
  type SemanticToken,
} from './theme/tokens.js';
export type {
  Slots,
  SlotName,
  SlotProps,
  ButtonSlotProps,
  ChipSlotProps,
  CardSlotProps,
  SeatSlotProps,
  WebglFallbackSlotProps,
} from './slots/slots.js';
export type { Easing } from './transitions/easing.js';
export type {
  CameraPose,
  CameraPath,
  FlightOptions,
  SceneOptions,
  SeatModelSource,
  AvatarOptions,
  Decal,
  HallAnchors,
} from './scene/types.js';
export {
  SeatView,
  type SeatViewProps,
  type SeatViewHandle,
  type FlightEvent,
} from './seat-view/SeatView.js';
export { HallPreview, type HallPreviewProps } from './seat-view/HallPreview.js';
export { useHallAnchors } from './scene/hall-anchors.js';

// Seat picker
export { SeatPicker, type SeatPickerProps } from './seat-picker/SeatPicker.js';
export { SeatPickerRoot } from './seat-picker/SeatPickerRoot.js';
export { SeatPickerMap } from './seat-picker/SeatPickerMap.js';
export { SeatPickerView, type SeatPickerViewProps } from './seat-picker/SeatPickerView.js';
export { SeatPickerSheet } from './seat-picker/SeatPickerSheet.js';
export { SeatPickerFooter } from './seat-picker/Footer.js';
export { useSeatPicker } from './seat-picker/use-seat-picker.js';
export type {
  SeatPickerRootProps,
  SeatPickerState,
  SelectionMode,
  OpenViewOn,
  ViewState,
  BookingStatus,
  ConfirmContext,
  ConfirmResult,
  PurchaseStatus,
  SheetOptions,
  TransitionEventInfo,
} from './seat-picker/types.js';
export { SeatMap, type SeatMapProps } from './seat-map/SeatMap.js';
export type {
  TransitionConfig,
  TransitionsProp,
  TransitionPresetName,
  MotionMode,
  PhaseName,
} from './transitions/presets.js';
export type { TransitionProgress } from './transitions/controller.js';
export type { Direction } from './transitions/timeline.js';
export type { SheetSkin } from './sheet/GlassSheet.js';
export type { SnapValue } from './sheet/snap.js';

// Hall constructor
export { HallConstructor } from './constructor/HallConstructor.js';
export { HallConstructorRoot } from './constructor/HallConstructorRoot.js';
export {
  HallConstructorCanvas,
  type HallConstructorCanvasProps,
} from './constructor/HallConstructorCanvas.js';
export {
  HallConstructorInspector,
  type HallConstructorInspectorProps,
} from './constructor/HallConstructorInspector.js';
export {
  useConstructorSelection,
  type ConstructorSelection,
  type ConstructorSelectionControl,
} from './constructor/selection.js';
export {
  HallConstructorIssues,
  type HallConstructorIssuesProps,
} from './constructor/HallConstructorIssues.js';
export {
  HallConstructorToolbar,
  type HallConstructorToolbarProps,
} from './constructor/toolbar/HallConstructorToolbar.js';
export { useHallEditor } from './constructor/editor/use-hall-editor.js';
export { useHallEditorContext } from './constructor/context.js';
export type {
  HallEditor,
  UseHallEditorOptions,
  ConfigPatch,
  DeepPatch,
  SectionRef,
  IssueTarget,
  EditorHistory,
  BandsApi,
  SectionsApi,
  SeatTypesApi,
  RevisionToken,
  MarkSavedOptions,
  ResetOptions,
  ImportTextOptions,
} from './constructor/editor/types.js';
export type {
  HallConstructorProps,
  HallConstructorRootProps,
  HallConstructorCommonProps,
  ExtraField,
  FieldLimit,
  FieldLimits,
  ConstructorView,
  SaveHandler,
  SaveContext,
} from './constructor/types.js';
export type { HallEditorContextValue, FocusControl } from './constructor/context.js';
export type { SaveController, SaveStatus } from './constructor/save/use-save.js';
// Convenience: the built-in hall templates (also available from @cinema-hall/core).
export { builtInTemplates } from '@cinema-hall/core';
