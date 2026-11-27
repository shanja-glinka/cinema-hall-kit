/**
 * Restoring an unsaved constructor draft from localStorage. Pure apart from the editor it is given.
 */
import type { ParseResult } from '@cinema-hall/core';
import type { ImportTextOptions } from '@cinema-hall/react';
import { MAX_STORED_YAML_BYTES } from '@/lib/server/body-limit';

/** The editor action a restore uses (`useHallEditor`'s result has it). */
export interface DraftTarget {
  importText(text: string, opts?: ImportTextOptions): ParseResult;
}

/**
 * Puts a draft back into the editor with `importText`, so its comments and key order are kept. A
 * draft is the editor's own text of a hall the server stored, so it may be a little over the upload
 * limit (the server adds the hall's id and header to an accepted file): it is read with the
 * stored-text limit instead of the parser's default. A draft over that limit, or one that is not a
 * valid hall, is refused.
 * @param editor The constructor's editor.
 * @param text The stored draft.
 * @param maxBytes Largest draft accepted; the stored-text limit by default.
 * @returns The parse result; `ok: false` with the issues when the draft was not restored.
 */
export function restoreDraftText(
  editor: DraftTarget,
  text: string,
  maxBytes: number = MAX_STORED_YAML_BYTES,
): ParseResult {
  return editor.importText(text, { maxBytes });
}
