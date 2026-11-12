/**
 * Sessions of the mock backend: create them for a hall (pinned to its current version), delete
 * them, and move future sessions to another version of the hall (api.md §8: "moving future
 * sessions is an explicit host operation based on `diffSeatManifests`").
 */
import { diffSeatManifests, type SeatKey } from '@cinema-hall/core';
import { planSessions, todayIso } from '@/lib/shared/generator';
import type { RepinResult, SessionView } from '@/lib/shared/types';
import { sessionView, tiersOfLayout } from './cards';
import {
  MAX_SESSIONS_TOTAL,
  currentVersionOf,
  db,
  findHall,
  findVersion,
  layoutOf,
  makeSession,
  pruneExpired,
  seededTaken,
  sessionStartMs,
  sessionsOfHall,
  type HallRecord,
  type HallVersion,
  type SessionRecord,
} from './store';
import type { Outcome } from './halls';

export const MAX_SESSIONS_PER_HALL = 400;

type Failure = { ok: false; error: string; message: string; field?: string };
type CreateSessionsBody =
  { ok: true; sessions: SessionView[]; created: number; skipped: number } | Failure;

/** Creates the sessions that the generator input describes, on the hall's current version. */
export function createSessions(hallId: string, input: unknown): Outcome<CreateSessionsBody> {
  const hall = findHall(hallId);
  if (!hall) return failure(404, 'hall_not_found', 'Hall not found.');
  const version = currentVersionOf(hall);
  const layout = version ? layoutOf(version.id) : undefined;
  if (!version || !layout) return failure(500, 'internal', 'The hall has no readable version.');

  const plan = planSessions(hall.id, input, tiersOfLayout(layout), todayIso());
  if (!plan.ok) return failure(400, 'invalid_generator', plan.message, plan.field);

  const state = db();
  const fresh = plan.specs.filter((spec) => !state.sessions.has(spec.id));
  if (sessionsOfHall(hall.id).length + fresh.length > MAX_SESSIONS_PER_HALL) {
    return failure(
      409,
      'limit',
      `A hall can have no more than ${MAX_SESSIONS_PER_HALL} showtimes.`,
    );
  }
  if (state.sessions.size + fresh.length > MAX_SESSIONS_TOTAL) {
    return failure(409, 'limit', `The demo is limited to ${MAX_SESSIONS_TOTAL} showtimes.`);
  }
  const created = fresh.map((spec) => makeSession(hall, spec));
  for (const session of created) state.sessions.set(session.id, session);
  return {
    status: 201,
    body: {
      ok: true,
      sessions: created.map(sessionView),
      created: created.length,
      skipped: plan.specs.length - fresh.length,
    },
  };
}

export function listSessions(hallId: string): SessionView[] | undefined {
  if (!findHall(hallId)) return undefined;
  return sessionsOfHall(hallId).map(sessionView);
}

/** Deletes a session. Refused while someone holds seats in it. */
export function deleteSession(hallId: string, sessionId: string): Outcome<{ ok: true } | Failure> {
  const session = db().sessions.get(sessionId);
  if (!session || session.hallId !== hallId) {
    return failure(404, 'session_not_found', 'Showtime not found.');
  }
  pruneExpired(session, Date.now());
  if (session.holds.size > 0) {
    return failure(409, 'has_holds', 'This showtime has active holds. Wait for them to expire.');
  }
  db().sessions.delete(sessionId);
  return { status: 200, body: { ok: true } };
}

/**
 * Moves the hall's future sessions to version `toRev` (the current one by default). For each
 * session the seat manifests of its version and of the target are compared; if the move removes a
 * seat that is held or taken in that session, the session stays where it is and is reported.
 */
export function repinHall(
  hallId: string,
  toRev: number | undefined,
): Outcome<RepinResult | Failure> {
  const hall = findHall(hallId);
  if (!hall) return failure(404, 'hall_not_found', 'Hall not found.');
  const target = pickVersion(hall, toRev);
  if (!target) return failure(404, 'version_not_found', 'That hall version does not exist.');

  const now = Date.now();
  const result: RepinResult = { ok: true, toRev: target.rev, moved: [], refused: [], unchanged: 0 };
  for (const session of sessionsOfHall(hall.id)) {
    if (session.hallVersionId === target.id || sessionStartMs(session) <= now) {
      result.unchanged += 1;
      continue;
    }
    const from = findVersion(session.hallVersionId);
    if (!from) {
      result.unchanged += 1;
      continue;
    }
    const blocked = seatsInUse(session, from, target, now);
    if (blocked.length > 0) {
      result.refused.push({ sessionId: session.id, keys: blocked });
      continue;
    }
    result.moved.push({ sessionId: session.id, fromRev: from.rev });
    session.hallVersionId = target.id;
    // The seeded taken seats follow the new layout; the holds that remain stay as they are.
    session.seedTaken = null;
    session.revision += 1;
  }
  return { status: 200, body: result };
}

function pickVersion(hall: HallRecord, toRev: number | undefined): HallVersion | undefined {
  if (toRev === undefined) return currentVersionOf(hall);
  return hall.versionIds
    .map((id) => findVersion(id))
    .find((version) => version !== undefined && version.rev === toRev);
}

/** Seats that moving `session` from `from` to `target` removes, and that are held or taken. */
function seatsInUse(
  session: SessionRecord,
  from: HallVersion,
  target: HallVersion,
  now: number,
): SeatKey[] {
  const removed = new Set(diffSeatManifests(from.manifest, target.manifest).removed);
  if (removed.size === 0) return [];
  pruneExpired(session, now);
  const inUse = new Set<SeatKey>();
  for (const key of session.holds.keys()) {
    if (removed.has(key)) inUse.add(key);
  }
  const layout = layoutOf(from.id);
  if (layout) {
    for (const key of seededTaken(session, layout)) {
      if (removed.has(key)) inUse.add(key);
    }
  }
  return [...inUse];
}

function failure(status: number, error: string, message: string, field?: string): Outcome<Failure> {
  return { status, body: { ok: false, error, message, ...(field ? { field } : {}) } };
}
