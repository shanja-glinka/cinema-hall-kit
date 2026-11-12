import { useRef, useState } from 'react';
import {
  buildSeatManifest,
  diffSeatManifests,
  hasErrors,
  type HallConfig,
  type Issue,
  type SeatKey,
} from '@cinema-hall/core';
import {
  latestBaseline,
  latestConfig,
  latestSnapshot,
  type SaveSnapshot as Snapshot,
} from '../editor/use-hall-editor.js';
import type { HallEditor, RevisionToken } from '../editor/types.js';
import type { SaveHandler } from '../types.js';

/**
 * The outcome of the last save request.
 */
export type SaveStatus = 'saved' | 'invalid' | 'conflict' | 'in_use' | 'error';

interface SaveSnapshot {
  /** The config the snapshot belongs to; a snapshot is shown only while the config is unchanged. */
  config: HallConfig;
  status: SaveStatus;
  serverIssues: Issue[];
  keys: SeatKey[];
  server: HallConfig | null;
  /** The YAML text and the token of the server version after `conflict`, when the host sent them. */
  serverSource?: string;
  serverRevision?: RevisionToken;
  message: string | null;
}

/**
 * Save state and actions for the toolbar, canvas and issue list.
 */
export interface SaveController {
  /** True when the host passed `onSave`. */
  readonly enabled: boolean;
  readonly saving: boolean;
  /** Result of the last save, while the config is the one that was saved. */
  readonly status: SaveStatus | null;
  /** The error text for `status: 'error'`. */
  readonly message: string | null;
  readonly serverIssues: readonly Issue[];
  /** Seats to highlight after `seats_in_use`. */
  readonly highlightKeys: readonly SeatKey[];
  /** The server version after `conflict`. */
  readonly serverConfig: HallConfig | null;
  /** Save is not allowed: read-only, error issues, or a save in progress. */
  readonly blocked: boolean;
  save(): Promise<void>;
  /** Replaces the editor with the server version from a `conflict` result. */
  loadServer(): void;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs the host save handler, applies its result to the editor and keeps the server issues.
 * @param editor Editor to save.
 * @param onSave Host save handler; none disables saving.
 * @param readOnly Whether saving is off.
 * @returns The save controller.
 * @example const save = useSaveController(editor, onSave, false);
 */
export function useSaveController(
  editor: HallEditor,
  onSave: SaveHandler | undefined,
  readOnly: boolean,
): SaveController {
  const [snapshot, setSnapshot] = useState<SaveSnapshot | null>(null);
  const [saving, setSaving] = useState(false);
  // Set synchronously, before the handler runs: a second call before a render is refused too.
  const inFlight = useRef(false);
  const current = snapshot !== null && snapshot.config === editor.config ? snapshot : null;
  // The server's errors block the same state they were answered for, like the editor's own errors.
  const blockedByErrors =
    hasErrors(editor.issues) || (current !== null && hasErrors(current.serverIssues));

  const save = async (): Promise<void> => {
    if (!onSave || readOnly || inFlight.current) return;
    inFlight.current = true;
    // What the failure snapshot is shown for if reading or serializing the state throws.
    let base: Omit<SaveSnapshot, 'status'> = {
      // The newest config, captured before anything can throw: a failure belongs to the state being
      // saved, and stays visible after an edit made in the same event is committed.
      config: latestConfig(editor),
      serverIssues: [],
      keys: [],
      server: null,
      message: null,
    };
    let sent: Snapshot | undefined;
    // A reset, a template, or a `markSaved` during the save starts a new session: the answer then
    // belongs to an earlier one. Both the baseline and the token are compared, from the newest state.
    const superseded = (): boolean => {
      if (sent === undefined) return false;
      const now = latestBaseline(editor);
      return now.baseline !== sent.baseline || now.revision !== sent.revision;
    };
    try {
      // One synchronous read of the newest state: config, YAML, issues, baseline and token belong
      // together even when React has not yet committed the latest edit or reset. Serializing can
      // throw (a broken source), so it is inside the boundary: the failure is reported, not lost.
      sent = latestSnapshot(editor);
      const config = sent.config;
      base = { ...base, config };
      const serverBlocked =
        current !== null && current.config === config && hasErrors(current.serverIssues);
      if (hasErrors(sent.issues) || serverBlocked) return;
      setSaving(true);
      const manifest = buildSeatManifest(config);
      const diff = diffSeatManifests(buildSeatManifest(sent.baseline), manifest);
      const result = await onSave(config, {
        yaml: sent.yaml,
        manifest,
        diff,
        issues: sent.issues,
        revision: sent.revision,
      });
      if (superseded()) return;
      if (result.ok) {
        // A baseline the editor cannot accept falls back to the config that was actually saved. The
        // token the host returned belongs to the saved state either way.
        const saved = { revision: result.revision };
        if (editor.markSaved(result.baseline ?? config, saved).length > 0) {
          editor.markSaved(config, saved);
        }
        setSnapshot({ ...base, status: 'saved' });
      } else if (result.reason === 'invalid') {
        setSnapshot({ ...base, status: 'invalid', serverIssues: result.issues });
      } else if (result.reason === 'conflict') {
        setSnapshot({
          ...base,
          status: 'conflict',
          server: result.server,
          serverSource: result.source,
          serverRevision: result.revision,
        });
      } else {
        setSnapshot({ ...base, status: 'in_use', keys: result.keys });
      }
    } catch (error) {
      if (!superseded()) setSnapshot({ ...base, status: 'error', message: errorText(error) });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const loadServer = (): void => {
    if (readOnly || !current?.server) return;
    // reset checks the structure only. A server version that changes a locked or hidden field is
    // installed as the new baseline; a structurally invalid one is rejected, and its issues are shown.
    const rejected = editor.reset(current.server, {
      source: current.serverSource,
      revision: current.serverRevision,
    });
    setSnapshot(
      rejected.length === 0 ? null : { ...current, status: 'invalid', serverIssues: rejected },
    );
  };

  return {
    enabled: onSave !== undefined,
    saving,
    status: current?.status ?? null,
    message: current?.message ?? null,
    serverIssues: current?.serverIssues ?? [],
    highlightKeys: current?.keys ?? [],
    serverConfig: current?.server ?? null,
    blocked: readOnly || blockedByErrors || saving,
    save,
    loadServer,
  };
}
