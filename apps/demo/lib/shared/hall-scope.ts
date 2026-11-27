/**
 * The hall the constructor page edits right now, readable synchronously. Answers that arrive after
 * the page has moved on to another hall ("Save as new hall" switches to the copy) belong to the hall
 * that asked, so they are dropped instead of landing on the new hall's panels.
 */
export interface HallScope {
  /** The hall the page edits, or `null` for a hall that is not saved yet. */
  readonly current: string | null;
  /** The page edits another hall from now on. */
  set(hallId: string | null): void;
  /** True while the page still edits `hallId`: an answer for it may be shown. */
  owns(hallId: string | null): boolean;
}

/**
 * @param initial The hall the page opened with.
 * @example const scope = createHallScope('orbita-hall-2'); scope.set('copy'); scope.owns('orbita-hall-2') // false
 */
export function createHallScope(initial: string | null): HallScope {
  let current = initial;
  return {
    get current() {
      return current;
    },
    set(hallId) {
      current = hallId;
    },
    owns(hallId) {
      return hallId === current;
    },
  };
}
