import type { CSSProperties, ReactNode } from 'react';
import type {
  FieldKey,
  HallConfig,
  Issue,
  ManifestDiff,
  SaveResult,
  SeatManifest,
  HallTemplate,
} from '@cinema-hall/core';
import type { CinemaHallOptions } from '../provider/provider.js';
import type { HallEditor, UseHallEditorOptions } from './editor/types.js';

/** The constructor's initial view. */
export type ConstructorView = '2d' | '3d';

/** Optional numeric UI bounds and step for a field. */
export interface FieldLimit {
  /** Smallest value the input accepts. */
  min?: number;
  /** Largest value the input accepts. */
  max?: number;
  /** Increment of the arrow keys and the spinner. */
  step?: number;
}

/** UI limits per field (a narrower range than the schema). Applied to inputs; the schema still decides. */
export type FieldLimits = Partial<Record<FieldKey, FieldLimit>>;

/** A host field stored in `config.meta`. `key` is `meta.<name>`. */
export interface ExtraField {
  /** Config path of the value, always under `meta`. */
  key: `meta.${string}`;
  /** Text shown above the control. */
  label: string;
  /** Kind of control to render. */
  control: 'text' | 'number' | 'select' | 'checkbox';
  /** Choices of a `select` control. */
  options?: readonly string[];
}

/** Serialized hall, advisory manifest and revision supplied to the host save handler. */
export interface SaveContext {
  /** The YAML to store (comments kept). */
  yaml: string;
  /** Advisory only: the server recomputes the manifest itself. */
  manifest: SeatManifest;
  /** Seats added, removed or moved against the baseline. */
  diff: ManifestDiff;
  /** Validation issues of the hall at the moment of saving (warnings, since errors block saving). */
  issues: Issue[];
  /**
   * The host's revision token of the hall being saved (the one the editor holds). Send it back as the
   * expected version. `undefined` when the host set none.
   */
  revision?: string | number;
}

/** Host persistence callback returning the save outcome. Receives config and save context. */
export type SaveHandler = (config: HallConfig, ctx: SaveContext) => Promise<SaveResult>;

/** Props shared by the whole constructor, the root and the one-call component. */
export interface HallConstructorCommonProps extends CinemaHallOptions {
  /** Disables every edit and the save; selection and navigation keep working. */
  readOnly?: boolean;
  /** Host fields stored in `config.meta` and edited under the hall's advanced settings. */
  extraFields?: readonly ExtraField[];
  /** UI limits per field, narrower than the schema. */
  fieldLimits?: FieldLimits;
  /** Initial view; defaults to the editable 2D plan. */
  view?: ConstructorView;
  /** Persists the hall; without it the save button is not shown. */
  onSave?: SaveHandler;
  /** Default true: asks before leaving the page while there are unsaved changes. */
  warnOnUnload?: boolean;
  /** Class added to the constructor root. */
  className?: string;
  /** Inline style of the constructor root. */
  style?: CSSProperties;
}

/** Editor, shared options and children of a composable constructor. */
export interface HallConstructorRootProps extends HallConstructorCommonProps {
  /** The editor created by `useHallEditor`. */
  editor: HallEditor;
  /** The constructor parts, in any layout. */
  children?: ReactNode;
}

/** Initial config and options for a constructor that owns its editor. */
export interface HallConstructorOwnProps
  extends HallConstructorCommonProps, Omit<UseHallEditorOptions, 'initial'> {
  /** Sugar: creates the editor internally from this config. */
  defaultValue: HallConfig;
}

/** A complete constructor, with either a host editor or an initial config. */
export type HallConstructorProps = HallConstructorCommonProps & {
  /** Templates for the "Start from template" menu. Default: the built-in templates. */
  templates?: readonly HallTemplate[];
} & (
    | { editor: HallEditor; defaultValue?: undefined }
    | ({ editor?: undefined } & HallConstructorOwnProps)
  );
