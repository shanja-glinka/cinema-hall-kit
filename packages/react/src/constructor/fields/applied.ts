import { useCallback, useEffect, useRef, useState } from 'react';
import type { HallConfig } from '@cinema-hall/core';
import { useHallEditorContext } from '../context.js';
import { latestBaseline } from '../editor/use-hall-editor.js';

/** How long a field shows that its value was applied, in milliseconds. */
export const APPLIED_FLASH_MS = 1600;

/**
 * A short "applied" state for a field: `mark()` after a commit that changed the hall turns it on,
 * and it turns itself off after `APPLIED_FLASH_MS`. The note says the change is not saved yet, so
 * it also goes away as soon as that is no longer true: when a save, "Save as new hall" or a loaded
 * server version installs a new baseline, or when the hall has no unsaved changes any more.
 * @returns Whether the flash is on, and the function that starts it.
 */
export function useAppliedFlash(): [boolean, () => void] {
  const { editor } = useHallEditorContext();
  // The baseline the change was made against: the note belongs to it and to no later one.
  const [markedOn, setMarkedOn] = useState<HallConfig | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const mark = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    setMarkedOn(latestBaseline(editor).baseline);
    timer.current = setTimeout(() => {
      timer.current = null;
      setMarkedOn(null);
    }, APPLIED_FLASH_MS);
  }, [editor]);
  const applied = markedOn !== null && markedOn === editor.baseline && editor.dirty;
  return [applied, mark];
}
