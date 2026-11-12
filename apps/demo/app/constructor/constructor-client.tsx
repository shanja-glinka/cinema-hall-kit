'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { HallConfig } from '@cinema-hall/core';
import {
  HallConstructor,
  useHallEditor,
  type ExtraField,
  type FieldLimits,
  type SaveHandler,
} from '@cinema-hall/react';
import {
  isCreateHallResponse,
  isRepinResponse,
  isSaveResponse,
  isSessionsList,
  type RepinResult,
  type SessionView,
} from '@/lib/shared/types';
import './constructor-page.css';

const DRAFT_DELAY_MS = 500;
const SHOWN_KEYS = 8;

/** Host fields. `meta.hallType` is stored in the YAML, so it survives the round-trip. */
const EXTRA_FIELDS: readonly ExtraField[] = [
  { key: 'meta.hallType', label: 'Hall type', control: 'select', options: ['LUX', '2D'] },
];

/** UI limits, narrower than the schema: the seat pitch moves in 0.05 m steps between 0.5 and 0.8 m. */
const FIELD_LIMITS: FieldLimits = {
  'section.seatPitch': { min: 0.5, max: 0.8, step: 0.05 },
};

interface Draft {
  yaml: string;
  savedAt: string;
}

/** Server hall config, original YAML and optimistic revision token. */
export interface ConstructorClientProps {
  config: HallConfig;
  /** The last saved YAML, with its comments. */
  source: string;
  /** Revision of the hall version being edited; `null` for a template that is not a hall yet. */
  revision: number | null;
  /** The hall being edited; `null` for a template: the first save then creates the hall. */
  hallId: string | null;
  /** Names the draft in `localStorage`: the hall id, or `template:<id>`. */
  draftId: string;
  /** A session of the hall to link from the header; `null` when it has none. */
  firstSessionId: string | null;
}

/** Result of the last save, shown above the editor with the follow-up actions. */
interface SavedInfo {
  rev: number;
  created: boolean;
}

function isDraft(value: unknown): value is Draft {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'yaml' in value &&
    typeof value.yaml === 'string' &&
    'savedAt' in value &&
    typeof value.savedAt === 'string'
  );
}

function readDraft(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDraft(parsed) ? parsed : null;
  } catch {
    // Storage can be blocked or hold junk. The constructor then starts from the server version.
    return null;
  }
}

function writeDraft(key: string, draft: Draft): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // A draft is a convenience: the constructor works without storage.
  }
}

function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // See writeDraft.
  }
}

/**
 * The demo constructor with revision-aware persistence and local draft recovery. It edits one
 * hall of the backend, or a template: the first save of a template creates the hall.
 * @param props Server config, source YAML, revision and the hall id.
 * @returns The constructor demo page.
 * @example <ConstructorClient config={config} source={yaml} revision={1} hallId="orbita-hall-2" draftId="orbita-hall-2" firstSessionId={null} />
 */
export function ConstructorClient({
  config,
  source,
  revision,
  hallId: initialHallId,
  draftId,
  firstSessionId,
}: ConstructorClientProps) {
  const draftKey = `cinema-hall-demo:draft:${draftId}`;
  const editor = useHallEditor({
    initial: config,
    source,
    ...(revision === null ? {} : { revision }),
  });
  const [hallId, setHallId] = useState(initialHallId);
  const [draftOffer, setDraftOffer] = useState<Draft | null>(null);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [saved, setSaved] = useState<SavedInfo | null>(null);
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [repin, setRepin] = useState<RepinResult | null>(null);
  const [repinError, setRepinError] = useState<string | null>(null);
  const [repinning, setRepinning] = useState(false);

  useEffect(() => {
    const draft = readDraft(draftKey);
    if (draft && draft.yaml !== source) setDraftOffer(draft);
  }, [draftKey, source]);

  // Unsaved edits go to localStorage 500 ms after the last change. While a restore is offered the
  // stored draft is left alone; a state with no unsaved changes clears it.
  useEffect(() => {
    if (draftOffer !== null) return undefined;
    const timer = window.setTimeout(() => {
      if (editor.dirty)
        writeDraft(draftKey, { yaml: editor.exportYaml(), savedAt: new Date().toISOString() });
      else clearDraft(draftKey);
    }, DRAFT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [editor, draftOffer, draftKey]);

  const loadSessions = async (id: string): Promise<void> => {
    try {
      const response = await fetch(`/api/halls/${encodeURIComponent(id)}/sessions`, {
        cache: 'no-store',
      });
      const body: unknown = await response.json();
      if (isSessionsList(body)) setSessions(body.sessions);
    } catch {
      // The panel then offers the home page instead of a session link.
    }
  };

  const onSave: SaveHandler = async (_saved, ctx) => {
    if (hallId === null) {
      // A template becomes a hall on its first save.
      const response = await fetch('/api/halls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml: ctx.yaml }),
      });
      const body: unknown = await response.json();
      if (!isCreateHallResponse(body)) throw new Error(`POST halls: ${response.status}`);
      if (!body.ok) throw new Error(body.message);
      clearDraft(draftKey);
      setHallId(body.hall.id);
      setSaved({ rev: body.hall.currentRev, created: true });
      void loadSessions(body.hall.id);
      return { ok: true, revision: body.hall.currentRev };
    }
    const response = await fetch(`/api/halls/${encodeURIComponent(hallId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRevision: ctx.revision, yaml: ctx.yaml }),
    });
    const body: unknown = await response.json();
    if (!isSaveResponse(body)) throw new Error(`POST hall: ${response.status}`);
    if (body.ok) {
      clearDraft(draftKey);
      setSaved({ rev: body.revision, created: false });
      setRepin(null);
      void loadSessions(hallId);
    }
    return body;
  };

  const movePastSessions = async (): Promise<void> => {
    if (hallId === null) return;
    setRepinning(true);
    setRepinError(null);
    try {
      const response = await fetch(`/api/halls/${encodeURIComponent(hallId)}/repin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body: unknown = await response.json();
      if (!isRepinResponse(body)) throw new Error(`repin: ${response.status}`);
      if (body.ok) setRepin(body);
      else setRepinError(body.message);
      await loadSessions(hallId);
    } catch {
      setRepinError('Could not reach the server. Please try again.');
    }
    setRepinning(false);
  };

  const restoreDraft = (draft: Draft) => {
    const result = editor.importText(draft.yaml);
    setDraftOffer(null);
    setRestoreFailed(!result.ok);
    if (!result.ok) clearDraft(draftKey);
  };

  const discardDraft = () => {
    clearDraft(draftKey);
    setDraftOffer(null);
  };

  return (
    <main className="constructor-page">
      <header className="constructor-header">
        <div>
          <p>
            <Link href="/">← Home</Link>
          </p>
          <h1>{editor.config.name}</h1>
          <p className="muted">
            {hallId === null
              ? 'This template is not a hall yet. The first save creates it on the server.'
              : 'Saving creates a new hall version. Existing showtimes stay on the previous version until you move them.'}
          </p>
        </div>
        {firstSessionId ? (
          <Link href={`/sessions/${firstSessionId}`} className="button secondary">
            Open a booking session
          </Link>
        ) : null}
      </header>

      {saved && hallId ? (
        <SavedPanel
          hallId={hallId}
          saved={saved}
          sessions={sessions}
          repin={repin}
          repinError={repinError}
          repinning={repinning}
          onRepin={() => void movePastSessions()}
        />
      ) : null}

      {draftOffer ? (
        <section className="panel draft-prompt" role="alertdialog" aria-labelledby="draft-title">
          <h2 id="draft-title">Restore draft?</h2>
          <p className="muted">
            An unsaved draft from {new Date(draftOffer.savedAt).toLocaleString('en-US')} is
            available.
          </p>
          <div className="actions">
            <button type="button" className="button" onClick={() => restoreDraft(draftOffer)}>
              Restore
            </button>
            <button type="button" className="button secondary" onClick={discardDraft}>
              Discard
            </button>
          </div>
        </section>
      ) : null}
      {restoreFailed ? (
        <p role="alert" className="notice">
          The draft could not be restored because it does not match this hall. It has been deleted.
        </p>
      ) : null}

      <HallConstructor
        editor={editor}
        locale="en-US"
        onSave={onSave}
        extraFields={EXTRA_FIELDS}
        fieldLimits={FIELD_LIMITS}
      />
    </main>
  );
}

interface SavedPanelProps {
  hallId: string;
  saved: SavedInfo;
  sessions: SessionView[];
  repin: RepinResult | null;
  repinError: string | null;
  repinning: boolean;
  onRepin: () => void;
}

/** After a save: what happened to the sessions, and the way to the booking page. */
function SavedPanel({
  hallId,
  saved,
  sessions,
  repin,
  repinError,
  repinning,
  onRepin,
}: SavedPanelProps) {
  const outdated = sessions.filter((session) => session.versionRev < saved.rev).length;
  const onNew = sessions.find((session) => session.versionRev === saved.rev);
  const bookingHref = onNew
    ? `/sessions/${onNew.id}`
    : `/?new=${encodeURIComponent(hallId)}#hall-${encodeURIComponent(hallId)}`;
  return (
    <section className="panel saved-panel" role="status" data-testid="saved-panel">
      <h2>
        {saved.created ? `Hall created · version ${saved.rev}` : `Version ${saved.rev} saved`}
      </h2>
      <p className="muted">
        {sessions.length === 0
          ? 'This hall has no showtimes yet.'
          : outdated > 0
            ? `${outdated} of ${sessions.length} showtimes use older versions. Move future showtimes to use the new version.`
            : `All ${sessions.length} showtimes use version ${saved.rev}.`}
      </p>
      <div className="actions">
        <button
          type="button"
          className="button"
          disabled={outdated === 0 || repinning}
          onClick={onRepin}
        >
          Move future showtimes
        </button>
        <Link href={bookingHref} className="button secondary">
          Open booking
        </Link>
      </div>
      {repinError ? (
        <p role="alert" className="notice">
          {repinError}
        </p>
      ) : null}
      {repin ? <RepinReport result={repin} /> : null}
    </section>
  );
}

function RepinReport({ result }: { result: RepinResult }) {
  return (
    <div className="repin-report" data-testid="repin-report">
      <p>
        Moved to version {result.toRev}: <strong>{result.moved.length}</strong>
        {result.refused.length > 0
          ? `, kept on the previous version: ${result.refused.length}`
          : ''}
        {result.unchanged > 0 ? `, unchanged: ${result.unchanged}` : ''}.
      </p>
      {result.refused.length > 0 ? (
        <ul>
          {result.refused.map((entry) => (
            <li key={entry.sessionId} data-testid="repin-refused">
              Showtime {entry.sessionId}: seats are held or taken that are not in the new version (
              {entry.keys.slice(0, SHOWN_KEYS).join(', ')}
              {entry.keys.length > SHOWN_KEYS ? ` and ${entry.keys.length - SHOWN_KEYS} more` : ''})
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
