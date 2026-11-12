import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { pathToString, type IssueRef } from '@cinema-hall/core';
import type { FocusControl } from '../context.js';

/** Advanced field groups used by issue focus requests. */
export const SECTION_KEYS = [
  'hall',
  'screen',
  'seatTypes',
  'bands',
  'constraints',
  'zones',
  'extra',
] as const;
/** One advanced field group. */
export type SectionKey = (typeof SECTION_KEYS)[number];

const DEFAULT_OPEN: readonly SectionKey[] = ['hall', 'bands'];
const WIDE_FROM_PX = 900;

/**
 * The advanced group that owns a config path.
 * @param path Config path.
 * @returns Its field group.
 */
export function sectionForPath(path: readonly (string | number)[]): SectionKey {
  switch (path[0]) {
    case 'screen':
      return 'screen';
    case 'seatTypes':
      return 'seatTypes';
    case 'layout':
      return 'bands';
    case 'constraints':
      return 'constraints';
    case 'viewingZones':
      return 'zones';
    case 'meta':
      return 'extra';
    default:
      return 'hall';
  }
}

/**
 * Finds an inspector field, then a reference anchor, then the nearest parent path.
 * @param root Constructor DOM root.
 * @param path Issue path.
 * @param ref Optional stable reference.
 * @returns The closest field or object anchor, or null.
 */
export function findFocusTarget(
  root: ParentNode | null,
  path: readonly (string | number)[],
  ref?: IssueRef,
): HTMLElement | null {
  if (!root) return null;
  root = root.querySelector('[data-chk="editor-inspector"]') ?? root;
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-chk-path], [data-chk-id]'));
  const byPath = (length: number): HTMLElement | undefined => {
    const key = pathToString(path.slice(0, length));
    return nodes.find((candidate) => candidate.dataset.chkPath === key);
  };
  const exact = path.length > 0 ? byPath(path.length) : undefined;
  if (exact) return exact;
  const anchor =
    ref?.sectionId !== undefined
      ? `section:${ref.sectionId}`
      : ref?.bandId !== undefined
        ? `band:${ref.bandId}`
        : ref?.seatTypeId !== undefined
          ? `seatType:${ref.seatTypeId}`
          : null;
  if (anchor !== null) {
    const byRef = nodes.find((candidate) => candidate.dataset.chkId === anchor);
    if (byRef) return byRef;
  }
  for (let length = path.length - 1; length > 0; length -= 1) {
    const node = byPath(length);
    if (node) return node;
  }
  return null;
}

/** The summary of an accordion section: a focusable fallback for issues with no anchor of their own. */
function sectionSummary(root: ParentNode | null, key: SectionKey): HTMLElement | null {
  return (
    root?.querySelector<HTMLElement>(
      `[data-chk="editor-section"][data-section="${key}"] > summary`,
    ) ?? null
  );
}

/** Focuses and scrolls a control into view. @param element Target element. @returns Nothing. */
export function focusElement(element: HTMLElement): void {
  element.focus({ preventScroll: true });
  if (typeof element.scrollIntoView === 'function') element.scrollIntoView({ block: 'center' });
}

/**
 * Advanced groups to open for a path and stable reference.
 * @param path Issue path.
 * @param ref Optional stable object reference.
 * @returns Field groups to reveal.
 */
export function sectionsForRequest(
  path: readonly (string | number)[],
  ref?: IssueRef,
): SectionKey[] {
  const keys: SectionKey[] = [];
  if (ref?.bandId !== undefined || ref?.sectionId !== undefined) keys.push('bands');
  else if (ref?.seatTypeId !== undefined) keys.push('seatTypes');
  if (path.length > 0 || keys.length === 0) keys.push(sectionForPath(path));
  return keys;
}

interface PendingFocus {
  readonly path: readonly (string | number)[];
  readonly ref: IssueRef | undefined;
  readonly sections: readonly SectionKey[];
  resolved?: boolean;
}

/**
 * Selects an issue target after the latest edit renders, then focuses its inspector field.
 * @param rootRef Constructor element ref.
 * @param onRequest Optional selection resolver, called before focus.
 * @param rebase Optional path rewriter: moves an index path onto the object a stable reference names.
 * @returns Selection and focus controls.
 * @example const focus = useFocusControl(rootRef);
 */
export function useFocusControl(
  rootRef: RefObject<HTMLDivElement | null>,
  onRequest?: (path: readonly (string | number)[], ref?: IssueRef) => void,
  rebase?: (path: readonly (string | number)[], ref?: IssueRef) => readonly (string | number)[],
): FocusControl {
  const [openSections, setOpen] = useState<ReadonlySet<SectionKey>>(() => new Set(DEFAULT_OPEN));
  const [tick, setTick] = useState(0);
  const pending = useRef<PendingFocus | null>(null);
  const requestHandler = useRef(onRequest);
  const rebaser = useRef(rebase);
  // Handlers change in the commit phase, never during render: an abandoned render must not leak its
  // callbacks. Declared before the focus effect, so it runs first.
  useLayoutEffect(() => {
    requestHandler.current = onRequest;
    rebaser.current = rebase;
  });

  const toggleSection = useCallback((key: SectionKey) => {
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const requestFocus = useCallback((path: readonly (string | number)[], ref?: IssueRef) => {
    const sections = sectionsForRequest(path, ref);
    pending.current = { path, ref, sections };
    setOpen((previous) => {
      const next = new Set(previous);
      for (const key of sections) next.add(key);
      return next;
    });
    setTick((value) => value + 1);
  }, []);

  // Runs after the section is open, so the element exists when we look for it.
  useEffect(() => {
    const request = pending.current;
    if (request === null) return;
    if (!request.resolved && requestHandler.current) {
      request.resolved = true;
      requestHandler.current(request.path, request.ref);
      setTick((value) => value + 1);
      return;
    }
    pending.current = null;
    // Rebased now, against the config that is committed: an edit made in the same event as the
    // request (a move, an insertion) has been rendered by this point.
    const path = rebaser.current ? rebaser.current(request.path, request.ref) : request.path;
    const target =
      findFocusTarget(rootRef.current, path, request.ref) ??
      sectionSummary(rootRef.current, request.sections[0] ?? sectionForPath(path));
    if (target) {
      let parent = target.parentElement;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      focusElement(target);
    }
  }, [openSections, tick, rootRef]);

  return { openSections, toggleSection, requestFocus };
}

/**
 * Observes whether the constructor container is at least 900 px wide.
 * @param rootRef Constructor element ref.
 * @returns Whether the container is wide.
 * @example const wide = useWideLayout(rootRef);
 */
export function useWideLayout(rootRef: RefObject<HTMLDivElement | null>): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const element = rootRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? WIDE_FROM_PX;
      setWide(width >= WIDE_FROM_PX);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [rootRef]);
  return wide;
}

/**
 * Asks the browser to confirm leaving while changes are unsaved.
 * @param active Whether the unload warning is enabled.
 * @returns Nothing.
 * @example useBeforeUnload(editor.dirty);
 */
export function useBeforeUnload(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);
}

/**
 * Delays WebGL until the client has mounted.
 * @returns Whether the first client mount completed.
 * @example const mounted = useMounted();
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
