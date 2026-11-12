import type { HallConfig, IssueRef } from '@cinema-hall/core';
import { useHallEditorContext } from './context.js';

/** An object in the constructor, addressed by stable ids rather than list positions. */
export type ConstructorSelection =
  | { kind: 'hall' | 'screen' | 'seatTypes'; bandId?: never; sectionId?: never }
  | { kind: 'band'; bandId: string; sectionId?: never }
  | { kind: 'section'; bandId: string; sectionId: string };

/** Shared selection controls for custom canvases and inspectors. */
export interface ConstructorSelectionControl {
  /** The selected object, or null when nothing is selected. */
  readonly selection: ConstructorSelection | null;
  /** Selects an object. */
  select(selection: ConstructorSelection): void;
  /** Clears the selection. */
  clear(): void;
}

/**
 * Reads and changes the selected constructor object inside HallConstructorRoot.
 * @returns The selection and its select/clear actions.
 * @example const { select } = useConstructorSelection(); select({ kind: 'screen' });
 */
export function useConstructorSelection(): ConstructorSelectionControl {
  return useHallEditorContext().selection;
}

/**
 * Moves an index path onto the band and section a stable reference names, so a request made with
 * indices that went stale (after a move or a removal) still reaches the right field.
 * @param config Current valid hall.
 * @param path Path with possibly stale band or section indices.
 * @param ref Stable reference of the intended object.
 * @returns The path with the indices of the referenced band and section, or the path itself.
 */
export function rebasePath(
  config: HallConfig,
  path: readonly (string | number)[],
  ref?: IssueRef,
): readonly (string | number)[] {
  // `ref` can be null at runtime (a parsed server issue), although its type says undefined.
  if (ref == null || path[0] !== 'layout' || path[1] !== 'bands') return path;
  const bands = config.layout.bands;
  const bandIndex =
    ref.bandId !== undefined
      ? bands.findIndex((band) => band.id === ref.bandId)
      : ref.sectionId !== undefined
        ? bands.findIndex((band) => band.sections.some((s) => s.id === ref.sectionId))
        : -1;
  const band = bands[bandIndex];
  if (band === undefined) return path;
  const next = [...path];
  next[2] = bandIndex;
  if (path[3] === 'sections' && ref.sectionId !== undefined) {
    const sectionIndex = band.sections.findIndex((s) => s.id === ref.sectionId);
    if (sectionIndex >= 0) next[4] = sectionIndex;
  }
  return next;
}

/**
 * Resolves external issue references and paths against the current config.
 * @param config Current valid hall.
 * @param path Issue path.
 * @param ref Optional stable object reference, preferred over indices.
 * @returns The closest selectable object.
 */
export function selectionForIssue(
  config: HallConfig,
  path: readonly (string | number)[],
  ref?: IssueRef,
): ConstructorSelection {
  const band = config.layout.bands.find((item, index) =>
    ref?.bandId !== undefined
      ? item.id === ref.bandId
      : ref?.sectionId !== undefined
        ? item.sections.some((section) => section.id === ref.sectionId)
        : path[0] === 'layout' && path[1] === 'bands' && index === path[2],
  );
  if (band) {
    const section = band.sections.find((item, index) =>
      ref?.sectionId !== undefined
        ? item.id === ref.sectionId
        : path[3] === 'sections' && index === path[4],
    );
    return section
      ? { kind: 'section', bandId: band.id, sectionId: section.id }
      : { kind: 'band', bandId: band.id };
  }
  if (ref?.seatTypeId !== undefined || path[0] === 'seatTypes' || path[0] === 'pricing')
    return { kind: 'seatTypes' };
  return {
    kind:
      path[0] === 'screen' || (path[0] === 'layout' && path[1] === 'firstRowDistance')
        ? 'screen'
        : 'hall',
  };
}
