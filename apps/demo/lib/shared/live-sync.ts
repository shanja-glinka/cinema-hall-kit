/**
 * Keeps an open booking page consistent when the session is moved to another hall version.
 * The seats of a snapshot only make sense on the layout of the same version, so the page commits
 * a snapshot together with a config of exactly that version, or not at all.
 */

export const MAX_SYNC_ATTEMPTS = 4;

export interface VersionedConfig<C> {
  config: C;
  hallVersionRev: number;
}

export interface SyncSources<S extends { hallVersionRev: number }, C> {
  fetchSnapshot(): Promise<S>;
  fetchConfig(): Promise<VersionedConfig<C>>;
}

export interface Synced<S, C> {
  snapshot: S;
  /** Present when the page has to redraw: the config of the snapshot's version. */
  config?: VersionedConfig<C>;
}

/**
 * Fetches a snapshot and, when its version is not the one the page draws, the config of that
 * version. If the two disagree (a re-pin happened between the two requests), both are dropped and
 * the pair is fetched again at once, so a map of one version is never shown with the occupancy of
 * another.
 * @param currentRev Version of the config the page draws now.
 * @param sources The two requests.
 * @param maxAttempts How many times to try before giving up.
 * @returns A consistent pair, or `null` when the version kept changing.
 */
export async function loadConsistent<S extends { hallVersionRev: number }, C>(
  currentRev: number,
  sources: SyncSources<S, C>,
  maxAttempts: number = MAX_SYNC_ATTEMPTS,
): Promise<Synced<S, C> | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const snapshot = await sources.fetchSnapshot();
    if (snapshot.hallVersionRev === currentRev) return { snapshot };
    const config = await sources.fetchConfig();
    if (config.hallVersionRev === snapshot.hallVersionRev) return { snapshot, config };
  }
  return null;
}
