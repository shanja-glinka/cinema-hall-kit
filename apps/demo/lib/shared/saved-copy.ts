/**
 * What the user changed in the editor while a save was on its way, so the server's copy of the
 * saved hall (its new id, header comment and revision) can be taken without losing those edits.
 */
import { parseHallConfig, type HallConfig } from '@cinema-hall/core';
import type { ConfigPatch, HallEditor } from '@cinema-hall/react';
import type { HallResponse } from './types';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]))
    );
  }
  return false;
}

function objectPatch(
  from: Record<string, unknown>,
  to: Record<string, unknown>,
): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};
  let changed = false;
  for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (!Object.hasOwn(to, key)) {
      // An `undefined` value removes the key (see `HallEditor.patch`).
      patch[key] = undefined;
      changed = true;
      continue;
    }
    const before = from[key];
    const after = to[key];
    if (sameValue(before, after)) continue;
    changed = true;
    const nested =
      isPlainObject(before) && isPlainObject(after) ? objectPatch(before, after) : null;
    patch[key] = nested ?? after;
  }
  return changed ? patch : null;
}

/**
 * The deep patch that turns `from` into `to`: changed values (arrays whole), added keys, and
 * removed keys as `undefined`. `null` when nothing changed.
 * @param from The config as it was sent to the server.
 * @param to The config in the editor now.
 * @returns The patch, in the form `HallEditor.patch` takes.
 */
export function changesBetween(from: HallConfig, to: HallConfig): ConfigPatch | null {
  return objectPatch(
    from as unknown as Record<string, unknown>,
    to as unknown as Record<string, unknown>,
  ) as ConfigPatch | null;
}

/** The part of the editor `adoptSavedCopy` uses. */
export type AdoptingEditor = Pick<HallEditor, 'config' | 'reset' | 'patch' | 'replace'>;

/**
 * Takes the server's copy of a hall that was just saved: it becomes the editor's baseline, with its
 * YAML text and revision. Edits made after the save started (`sent` is the config that was saved)
 * are put back on top, so they stay as unsaved changes instead of being reverted.
 * @param editor The editor, read at the moment the server copy arrives.
 * @param server The server's config of the saved hall.
 * @param options Its YAML text and revision.
 * @param sent The config the save sent.
 * @returns Whether the editor now has unsaved edits made during the save.
 */
export function adoptSavedCopy(
  editor: AdoptingEditor,
  server: HallConfig,
  options: { source: string; revision: number },
  sent: HallConfig,
): boolean {
  const current = editor.config;
  const edits = changesBetween(sent, current);
  if (editor.reset(server, options).length > 0) return false;
  if (!edits) return false;
  if (editor.patch(edits).length === 0) return true;
  // The edits do not apply on top of the server copy: keep them whole, under the hall's new id.
  const { id } = server;
  editor.replace({ ...current, ...(id === undefined ? {} : { id }) });
  return true;
}

/**
 * Takes a hall the server has just stored (the `stored` part of the create answer) into the
 * editor, as `adoptSavedCopy` does.
 * @param editor The editor, read at the moment the answer arrives.
 * @param stored The stored hall: config, YAML text and revision.
 * @param sent The config the save sent.
 * @returns `true` when the editor now edits the stored hall; `false` when it could not take it and
 * still holds what it had (the caller must then not save from it to the new hall).
 */
export function adoptStoredHall(
  editor: AdoptingEditor,
  stored: HallResponse,
  sent: HallConfig,
): boolean {
  const parsed = parseHallConfig(stored.config);
  if (!parsed.ok) return false;
  let taken = true;
  const watched: AdoptingEditor = {
    get config() {
      return editor.config;
    },
    reset: (config, options) => {
      const rejected = editor.reset(config, options);
      taken = rejected.length === 0;
      return rejected;
    },
    patch: (patch) => editor.patch(patch),
    replace: (config) => editor.replace(config),
  };
  adoptSavedCopy(
    watched,
    parsed.config,
    { source: stored.source, revision: stored.revision },
    sent,
  );
  return taken;
}
