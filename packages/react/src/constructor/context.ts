import { createContext, useContext, type RefObject } from 'react';
import type { IssueRef } from '@cinema-hall/core';
import type { ResolvedOptions } from '../provider/provider.js';
import type { HallEditor } from './editor/types.js';
import type { SaveController } from './save/use-save.js';
import type { ConstructorSelectionControl } from './selection.js';
import type { SectionKey } from './ui/hooks.js';
import type { ExtraField, FieldLimits, ConstructorView } from './types.js';

/** Issue focus requests and advanced-field visibility shared by constructor parts. */
export interface FocusControl {
  /** Advanced field groups that are open. */
  readonly openSections: ReadonlySet<SectionKey>;
  /** Opens or closes one advanced field group. */
  toggleSection(key: SectionKey): void;
  /**
   * Opens the sections that hold `ref` (a band, section or seat type) and `path`, then focuses the field
   * at `path`, else the element of `ref`, else the nearest parent of `path`, else the section's heading.
   */
  requestFocus(path: readonly (string | number)[], ref?: IssueRef): void;
}

/** Everything the constructor parts share. Read it with `useHallEditorContext()`. */
export interface HallEditorContextValue {
  /** The hall editor. */
  readonly editor: HallEditor;
  /** Resolved theme, labels, locale, slots and price formatter. */
  readonly options: ResolvedOptions;
  /** Whether editing is off. */
  readonly readOnly: boolean;
  /** The canvas view: the editable plan or the 3D preview. */
  readonly view: ConstructorView;
  /** Switches the canvas view. */
  setView(view: ConstructorView): void;
  /** The selected object and its controls. */
  readonly selection: ConstructorSelectionControl;
  /** Whether clicking a seat of the selected section toggles its exclusion. */
  readonly exclusion: boolean;
  /** Turns seat-exclusion mode on or off. */
  setExclusion(active: boolean): void;
  /** The notice shown to the user until dismissed (usually why the last action was rejected); null when none. */
  readonly notice: string | null;
  /**
   * Shows a rejection reason (or clears it with null). `tone: 'info'` shows a neutral notice, for
   * example that the hall was made deeper to fit a new row of sections. Default `'error'`.
   */
  notify(message: string | null, tone?: 'error' | 'info'): void;
  /** Host fields stored in `config.meta`. */
  readonly extraFields: readonly ExtraField[];
  /** UI limits per field. */
  readonly fieldLimits: FieldLimits;
  /** The save flow state and actions. */
  readonly save: SaveController;
  /** Issue focus requests and advanced-field visibility. */
  readonly focus: FocusControl;
  /** True when the constructor is at least 900 px wide (two columns); false places the inspector below the canvas. */
  readonly wide: boolean;
  /** The constructor root element. */
  readonly rootRef: RefObject<HTMLDivElement | null>;
}

/** React context owned by HallConstructorRoot; null outside a constructor. */
export const HallEditorContext = createContext<HallEditorContextValue | null>(null);

/**
 * The editor and the constructor's UI state. Use it inside `HallConstructorRoot` (or
 * `HallConstructor`) to build your own parts.
 * @returns The current editor, options and UI controls.
 * @example const { editor } = useHallEditorContext();
 */
export function useHallEditorContext(): HallEditorContextValue {
  const value = useContext(HallEditorContext);
  if (value === null) {
    throw new Error('useHallEditorContext must be used inside <HallConstructorRoot>.');
  }
  return value;
}
