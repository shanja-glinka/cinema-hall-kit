/**
 * Halls of the mock backend (api.md §3.3 and §8): create a hall from YAML, read the current
 * version, save a new one. Saving never changes a session: sessions stay pinned to the version
 * they were made on until the host moves them (`repinHall` in sessions.ts).
 */
import { parseHallConfig, validateHall, type HallConfig } from '@cinema-hall/core';
import { planSessions, todayIso } from '@/lib/shared/generator';
import { checkHallText, tiersOf } from '@/lib/shared/hall-check';
import type {
  CreateHallBody,
  CreateHallResponse,
  HallResponse,
  HallSaveResponse,
} from '@/lib/shared/types';
import { hallCard } from './cards';
import {
  MAX_HALLS,
  MAX_SESSIONS_TOTAL,
  currentVersionOf,
  db,
  findHall,
  makeSession,
  makeVersion,
  type HallRecord,
  type HallVersion,
} from './store';

const MAX_CINEMA_CHARS = 60;

const TRANSLIT: Record<string, string> = {
  '\u0430': 'a',
  '\u0431': 'b',
  '\u0432': 'v',
  '\u0433': 'g',
  '\u0434': 'd',
  '\u0435': 'e',
  '\u0451': 'e',
  '\u0436': 'zh',
  '\u0437': 'z',
  '\u0438': 'i',
  '\u0439': 'y',
  '\u043a': 'k',
  '\u043b': 'l',
  '\u043c': 'm',
  '\u043d': 'n',
  '\u043e': 'o',
  '\u043f': 'p',
  '\u0440': 'r',
  '\u0441': 's',
  '\u0442': 't',
  '\u0443': 'u',
  '\u0444': 'f',
  '\u0445': 'h',
  '\u0446': 'c',
  '\u0447': 'ch',
  '\u0448': 'sh',
  '\u0449': 'sch',
  '\u044a': '',
  '\u044b': 'y',
  '\u044c': '',
  '\u044d': 'e',
  '\u044e': 'yu',
  '\u044f': 'ya',
};

export function getHallResponse(hallId: string): HallResponse | undefined {
  const hall = findHall(hallId);
  if (!hall) return undefined;
  const version = currentVersionOf(hall);
  if (!version) return undefined;
  return {
    hallId,
    revision: version.rev,
    config: version.config,
    source: version.source,
  };
}

/** Converts a hall name to a short id made from latin letters, digits and dashes. */
export function slugify(name: string): string {
  const latin = [...name.toLowerCase()].map((char) => TRANSLIT[char] ?? char).join('');
  return latin
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** The hall id: `config.id` or a slug of the name, made unique with a numeric suffix. */
export function deriveHallId(config: HallConfig, taken: ReadonlySet<string>): string {
  const base = config.id ?? (slugify(config.name) || 'hall');
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export interface Outcome<T> {
  status: number;
  body: T;
}

/**
 * Creates a hall from YAML, and optionally its sessions, in one step. Nothing is created unless
 * the hall and the generator input are both valid. The client's own checks are only feedback: the
 * hall is validated here with `enforce: true`.
 */
export function createHall(input: CreateHallBody): Outcome<CreateHallResponse> {
  const fail = (
    status: number,
    error: string,
    message: string,
    extra: { field?: string } = {},
  ): Outcome<CreateHallResponse> => ({
    status,
    body: { ok: false, error, message, ...extra },
  });

  const check = checkHallText(input.yaml, { enforce: true });
  if (!check.ok) {
    return {
      status: 400,
      body: {
        ok: false,
        error: 'invalid_hall',
        message: 'The hall did not pass validation.',
        issues: [...check.errors, ...check.warnings],
      },
    };
  }
  const cinema = input.cinema?.trim() ?? '';
  if (cinema.length > MAX_CINEMA_CHARS) {
    return fail(
      400,
      'invalid_cinema',
      `Cinema name cannot exceed ${MAX_CINEMA_CHARS} characters.`,
      {
        field: 'cinema',
      },
    );
  }

  const state = db();
  if (state.halls.size >= MAX_HALLS) {
    return fail(
      409,
      'limit',
      `The demo is limited to ${MAX_HALLS} halls. Restart the server to reset it.`,
    );
  }
  const hallId = deriveHallId(check.config, new Set(state.halls.keys()));

  // Everything that can fail runs before the first write: the version (manifest and layout), then
  // the generator. A refused request leaves no trace.
  let version: HallVersion;
  try {
    version = makeVersion(hallId, 1, check.config, input.yaml);
  } catch {
    return fail(500, 'internal', 'Could not build the hall.');
  }
  const plan = input.generator
    ? planSessions(hallId, input.generator, tiersOf(version.layout), todayIso())
    : null;
  if (plan && !plan.ok) return fail(400, 'invalid_generator', plan.message, { field: plan.field });
  if (plan && state.sessions.size + plan.specs.length > MAX_SESSIONS_TOTAL) {
    return fail(409, 'limit', `The demo is limited to ${MAX_SESSIONS_TOTAL} showtimes.`);
  }

  const hall: HallRecord = {
    id: hallId,
    name: check.config.name,
    ...(cinema ? { cinema } : {}),
    versionIds: [version.id],
    currentVersionId: version.id,
  };
  state.halls.set(hall.id, hall);
  state.versions.set(version.id, version);
  let created = 0;
  for (const spec of plan?.specs ?? []) {
    if (state.sessions.has(spec.id)) continue;
    state.sessions.set(spec.id, makeSession(hall, spec));
    created += 1;
  }
  const card = hallCard(hall);
  if (!card) {
    // Cannot happen with a version made above; undo rather than leave a hall that cannot be shown.
    state.halls.delete(hall.id);
    state.versions.delete(version.id);
    for (const spec of plan?.specs ?? []) state.sessions.delete(spec.id);
    return fail(500, 'internal', 'Could not display the hall.');
  }
  return { status: 201, body: { ok: true, hall: card, created, skipped: 0 } };
}

/**
 * Saves a YAML text as the next version of the hall. Checks run in this order:
 * structure and server-side rules (`invalid`), then the baseline revision (`conflict`).
 * Sessions are not touched, so seats that sessions use are no obstacle here: they are checked
 * when the host moves a session to the new version.
 */
export function saveHall(
  hallId: string,
  baseRevision: number,
  yaml: string,
): HallSaveResponse | undefined {
  const hall = findHall(hallId);
  if (!hall) return undefined;
  const current = currentVersionOf(hall);
  if (!current) return undefined;
  const revision = current.rev;

  const parsed = parseHallConfig(yaml, { format: 'auto' });
  if (!parsed.ok) return { ok: false, reason: 'invalid', issues: parsed.issues, revision };
  // The server ignores `constraints` written in the document: thresholds are its own.
  const issues = validateHall(parsed.config, { enforce: true });
  if (issues.some((issue) => issue.severity === 'error')) {
    return { ok: false, reason: 'invalid', issues, revision };
  }

  if (baseRevision !== revision) {
    // The YAML comes with the conflict: the editor reloads from it and keeps its comments.
    return {
      ok: false,
      reason: 'conflict',
      server: current.config,
      source: current.source,
      revision,
    };
  }

  const rev = current.rev + 1;
  let version: HallVersion;
  try {
    version = makeVersion(hallId, rev, parsed.config, yaml);
  } catch {
    return { ok: false, reason: 'invalid', issues: [], revision };
  }
  const state = db();
  state.versions.set(version.id, version);
  hall.versionIds.push(version.id);
  hall.currentVersionId = version.id;
  hall.name = parsed.config.name;
  return { ok: true, baseline: parsed.config, revision: rev };
}
