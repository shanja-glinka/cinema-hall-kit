/**
 * What the saved panel offers after a hall save: how many showtimes "Move future showtimes" can
 * still move. Pure, so the browser and the tests share it.
 */
import type { RepinResult, SessionView } from './types';

/**
 * Showtimes on an older version than `savedRev` that pressing "Move future showtimes" may move.
 * A showtime the last move refused for a sold seat is left out: the seat stays sold, so pressing
 * again cannot help. A showtime refused only for temporary holds is still counted: holds end, and
 * the move can then go through.
 * @param sessions The hall's showtimes.
 * @param savedRev Revision of the saved version.
 * @param repin The answer of the last move, or `null` when there was none.
 * @returns The number of showtimes to offer the move for.
 */
export function movableCount(
  sessions: readonly Pick<SessionView, 'id' | 'versionRev'>[],
  savedRev: number,
  repin: Pick<RepinResult, 'refused'> | null,
): number {
  const stuck = new Set(
    (repin?.refused ?? [])
      .filter((entry) => entry.retryable !== true)
      .map((entry) => entry.sessionId),
  );
  return sessions.filter((session) => session.versionRev < savedRev && !stuck.has(session.id))
    .length;
}
