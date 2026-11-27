/**
 * Halls of the mock backend (api.md §3.3 and §8): create a hall from YAML, read the current
 * version, save a new one. Saving never changes a session: sessions stay pinned to the version
 * they were made on until the host moves them (`repinHall` in sessions.ts).
 */
import { parseHallConfig, validateHall } from '@cinema-hall/core';
import { planSessions, todayIso } from '@/lib/shared/generator';
import { checkHallText, tiersOf, type HallCheck } from '@/lib/shared/hall-check';
import { deriveHallId } from '@/lib/shared/hall-id';
import { t } from '@/lib/shared/texts';
import { hallHeader, replaceHeaderComment, setTopLevelField } from '@/lib/shared/hall-text';
import type {
  CreateHallBody,
  CreateHallResponse,
  HallResponse,
  HallSaveResponse,
} from '@/lib/shared/types';
import { MAX_STORED_YAML_BYTES, MAX_YAML_BYTES } from './body-limit';
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
const MAX_NAME_CHARS = 120;
/** Issues of a text that cannot be read as a hall at all (the name of such a text is not replaced). */
const UNREADABLE = new Set([
  'input.empty',
  'input.unreadable',
  'schema.syntax',
  'schema.tooLarge',
  'schema.unsupportedVersion',
]);

// Kept here for the modules and tests that import them from the backend.
export { deriveHallId, slugify } from '@/lib/shared/hall-id';

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

export interface Outcome<T> {
  status: number;
  body: T;
}

/**
 * Creates a hall from YAML, and optionally its sessions, in one step. Nothing is created unless
 * the hall and the generator input are both valid. `name` replaces the name in the document;
 * `asNew` (the constructor's new halls) makes the id from the name and gives the document a header
 * of its own. When the document's `id` is not used, the answer says so in `requestedId`. The client's own checks are only feedback: the
 * hall is validated here with `enforce: true`.
 */
export function createHall(input: CreateHallBody): Outcome<CreateHallResponse> {
  const texts = t.server;
  const fail = (
    status: number,
    error: string,
    message: string,
    extra: { field?: string } = {},
  ): Outcome<CreateHallResponse> => ({
    status,
    body: { ok: false, error, message, ...extra },
  });

  const name = input.name?.trim();
  if (input.name !== undefined && (!name || name.length > MAX_NAME_CHARS)) {
    return fail(400, 'invalid_name', texts.invalidName(MAX_NAME_CHARS), {
      field: 'name',
    });
  }
  // An upload is limited to 256 KiB. A hall made in the constructor (`asNew`) comes from a text this
  // server wrote, which may already carry its id and header on top of that (`MAX_STORED_YAML_BYTES`).
  const maxBytes = input.asNew === true ? MAX_STORED_YAML_BYTES : MAX_YAML_BYTES;
  const invalid = (check: Extract<HallCheck, { ok: false }>): Outcome<CreateHallResponse> => ({
    status: 400,
    body: {
      ok: false,
      error: 'invalid_hall',
      message: texts.invalidHall,
      issues: [...check.errors, ...check.warnings],
    },
  });
  if (name) {
    // The text as it was sent must be readable (and within the size limit) before its name is
    // replaced: the edit could otherwise hide a fault in it, such as a second `name` key.
    const original = checkHallText(input.yaml, { enforce: true, maxBytes });
    if (!original.ok && original.errors.some((issue) => UNREADABLE.has(issue.code))) {
      return invalid(original);
    }
  }
  const yaml = name ? setTopLevelField(input.yaml, 'name', name) : input.yaml;
  const check = checkHallText(yaml, { enforce: true, maxBytes });
  if (!check.ok) return invalid(check);
  const cinema = input.cinema?.trim() ?? '';
  if (cinema.length > MAX_CINEMA_CHARS) {
    return fail(400, 'invalid_cinema', texts.invalidCinema(MAX_CINEMA_CHARS), { field: 'cinema' });
  }

  const state = db();
  if (state.halls.size >= MAX_HALLS) {
    return fail(409, 'limit', texts.hallLimit(MAX_HALLS));
  }
  const asNew = input.asNew === true;
  const hallId = deriveHallId(check.config, new Set(state.halls.keys()), { ignoreConfigId: asNew });
  const requestedId =
    check.config.id !== undefined && check.config.id !== hallId ? check.config.id : undefined;

  // The stored document names the id the hall really has, and a hall made in the constructor gets a
  // header comment of its own instead of the one of the file it was made from.
  let source = yaml;
  let config = check.config;
  if (check.config.id !== hallId || asNew) {
    source = setTopLevelField(source, 'id', hallId);
    if (asNew) source = replaceHeaderComment(source, hallHeader(check.config.name));
    // The id line and header written here may take a file at the upload limit over it: the stored
    // text has its own, slightly larger limit, so an accepted file is never refused at this step.
    const stored = checkHallText(source, { enforce: true, maxBytes: MAX_STORED_YAML_BYTES });
    if (!stored.ok) return fail(500, 'internal', texts.storeFailed);
    config = stored.config;
  }

  // Everything that can fail runs before the first write: the version (manifest and layout), then
  // the generator. A refused request leaves no trace.
  let version: HallVersion;
  try {
    version = makeVersion(hallId, 1, config, source);
  } catch {
    return fail(500, 'internal', texts.buildFailed);
  }
  const plan = input.generator
    ? planSessions(hallId, input.generator, tiersOf(version.layout), todayIso())
    : null;
  if (plan && !plan.ok) return fail(400, 'invalid_generator', plan.message, { field: plan.field });
  if (plan && state.sessions.size + plan.specs.length > MAX_SESSIONS_TOTAL) {
    return fail(409, 'limit', texts.showtimeLimit(MAX_SESSIONS_TOTAL));
  }

  const hall: HallRecord = {
    id: hallId,
    name: config.name,
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
    return fail(500, 'internal', texts.displayFailed);
  }
  return {
    status: 201,
    body: {
      ok: true,
      hall: card,
      created,
      skipped: 0,
      ...(requestedId ? { requestedId } : {}),
      stored: { hallId, revision: version.rev, config: version.config, source: version.source },
    },
  };
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

  // The editor sends back the text this server stored (its id included), so the stored limit applies.
  const parsed = parseHallConfig(yaml, { format: 'auto', maxBytes: MAX_STORED_YAML_BYTES });
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
