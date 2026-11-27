/**
 * One save at a time in the constructor. Updating the hall, creating a new hall and taking the new
 * hall's stored copy into the editor all go through the same gate, so an answer that arrives late
 * can never belong to a hall the page no longer edits. Pure: safe for client and server files.
 */

/**
 * - `idle`: a save may start.
 * - `busy`: a save (or taking a new hall into the editor) is running.
 * - `blocked`: a new hall was saved but could not be taken into the editor. The editor still holds
 *   the hall it came from, so a further save could write that hall over the new one: none is allowed
 *   until the page is reloaded.
 */
export type SaveGateState = 'idle' | 'busy' | 'blocked';

export interface SaveGate {
  readonly state: SaveGateState;
  /** Starts a save. `false` (and nothing changes) unless the gate is `idle`. */
  begin(): boolean;
  /** Ends the running save. A blocked gate stays blocked. */
  end(): void;
  /** No more saves on this page. */
  block(): void;
}

/**
 * @param onChange Called with every new state (a React state setter, for the buttons).
 * @returns A gate that starts `idle`.
 */
export function createSaveGate(
  onChange: (state: SaveGateState) => void = () => undefined,
): SaveGate {
  let state: SaveGateState = 'idle';
  const set = (next: SaveGateState): void => {
    if (next === state) return;
    state = next;
    onChange(next);
  };
  return {
    get state() {
      return state;
    },
    begin() {
      if (state !== 'idle') return false;
      set('busy');
      return true;
    },
    end() {
      if (state === 'busy') set('idle');
    },
    block() {
      set('blocked');
    },
  };
}
