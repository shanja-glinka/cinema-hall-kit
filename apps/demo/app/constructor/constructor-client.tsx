'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { hasErrors, type HallConfig } from '@cinema-hall/core';
import {
  HallConstructor,
  useHallEditor,
  type ExtraField,
  type FieldLimits,
  type SaveHandler,
} from '@cinema-hall/react';
import { LOCALE, t } from '@/lib/shared/texts';
import { dateShort } from '@/lib/shared/dates';
import { copyName } from '@/lib/shared/hall-text';
import { movableCount } from '@/lib/shared/repin';
import { createHallScope } from '@/lib/shared/hall-scope';
import { createSaveGate, type SaveGateState } from '@/lib/shared/save-gate';
import { adoptStoredHall } from '@/lib/shared/saved-copy';
import { makeOthersInert } from '@/lib/shared/modal';
import { restoreDraftText } from '@/lib/shared/draft-restore';
import {
  isCreateHallResponse,
  isRepinResponse,
  isSaveResponse,
  isSessionsList,
  type CreateHallResponse,
  type HallResponse,
  type RepinResult,
  type SessionView,
} from '@/lib/shared/types';
import './constructor-page.css';

const DRAFT_DELAY_MS = 500;
const SHOWN_KEYS = 8;

/**
 * Host fields. `meta.hallType` is stored in the YAML, so it survives the round-trip. A constant at
 * module level: the editor compares the prop by identity.
 */
const EXTRA_FIELDS: readonly ExtraField[] = [
  {
    key: 'meta.hallType',
    label: t.editor.hallType,
    control: 'select',
    options: ['LUX', '2D'],
  },
];

/** UI limits, narrower than the schema: the seat pitch moves in 0.05 m steps between 0.5 and 0.8 m. */
const FIELD_LIMITS: FieldLimits = {
  'section.seatPitch': { min: 0.5, max: 0.8, step: 0.05 },
};

interface Draft {
  yaml: string;
  savedAt: string;
}

/** The hall being edited, as the server knows it when the page opens. */
export interface ExistingHall {
  /** The saved name, which the save dialog talks about (the editor may hold a new one). */
  name: string;
  /** A hall the demo started with: a save makes a copy unless the user chooses to update it. */
  sample: boolean;
  sessions: SessionView[];
}

/** Server hall config, original YAML and optimistic revision token. */
export interface ConstructorClientProps {
  config: HallConfig;
  /** The last saved YAML, with its comments. */
  source: string;
  /** Revision of the hall version being edited; `null` for a new hall that is not saved yet. */
  revision: number | null;
  /** The hall being edited; `null` for a new hall: the first save then creates it. */
  hallId: string | null;
  /** Names the draft in `localStorage`: the hall id, `template:<id>` or `copy:<id>`. */
  draftId: string;
  /** The hall being edited; `null` for a new hall. */
  existing: ExistingHall | null;
  /** What a new hall starts from, in words (`the “Stadium” template`); `null` for an existing hall. */
  origin: string | null;
}

/** Result of the last save, shown above the editor with the next steps. */
interface SavedInfo {
  rev: number;
  created: boolean;
  name: string;
  /** For a hall saved as a copy of another one: the name of the hall that stays unchanged. */
  copyOf?: string;
  /** The id written in the document when the new hall got another one. */
  requestedId?: string;
}

/** What the save dialog was opened for, and how it answers. */
interface SaveQuestion {
  /** `choose`: update or new hall; `new`: only a new hall (the "Save as new hall" button). */
  mode: 'choose' | 'new';
  resolve: (answer: SaveAnswer) => void;
  /** What had the focus when the question was asked (the button that opened it): it gets it back. */
  opener: HTMLElement | null;
}

/** A successful create answer. */
type CreatedHall = Extract<CreateHallResponse, { ok: true }>;

type SaveAnswer = { kind: 'new'; name: string } | { kind: 'update' } | { kind: 'cancel' };

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

const draftKeyOf = (id: string): string => `cinema-hall-demo:draft:${id}`;

/**
 * The demo constructor with revision-aware persistence and local draft recovery. It edits one
 * hall of the backend, or a new hall (from a template or a copy) that its first save creates.
 * Saving over a sample hall, or over a hall that has showtimes, first asks whether to update it or
 * to save the changes as a new hall.
 * @param props Server config, source YAML, revision, the hall id and what the server knows of it.
 * @returns The constructor demo page.
 * @example <ConstructorClient config={config} source={yaml} revision={1} hallId="orbita-hall-2" draftId="orbita-hall-2" existing={{ name: 'Orbita Hall 2', sample: true, sessions: [] }} origin={null} />
 */
export function ConstructorClient({
  config,
  source,
  revision,
  hallId: initialHallId,
  draftId,
  existing,
  origin,
}: ConstructorClientProps) {
  const texts = t.editor;
  const editor = useHallEditor({
    initial: config,
    source,
    ...(revision === null ? {} : { revision }),
  });
  // The editor of the latest render, for answers that arrive after the user has edited further.
  const editorRef = useRef(editor);
  useLayoutEffect(() => {
    editorRef.current = editor;
  });
  const [hallId, setHallId] = useState(initialHallId);
  // The same hall id, readable at once: showtime and move answers for a hall the page has left
  // (after "Save as new hall") are dropped, not shown on the new hall's panel.
  const [scope] = useState(() => createHallScope(initialHallId));
  const [hallName, setHallName] = useState(existing?.name ?? config.name);
  const [sample, setSample] = useState(existing?.sample ?? false);
  // `ask` until the user has answered the save question once on this page.
  const [saveMode, setSaveMode] = useState<'ask' | 'update'>('ask');
  const [question, setQuestion] = useState<SaveQuestion | null>(null);
  const [draftOffer, setDraftOffer] = useState<Draft | null>(null);
  // The same offer, readable at once: a save that finishes later checks whether it is still open.
  const draftOfferRef = useRef(draftOffer);
  useLayoutEffect(() => {
    draftOfferRef.current = draftOffer;
  });
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [saved, setSaved] = useState<SavedInfo | null>(null);
  const [saveAsNewError, setSaveAsNewError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionView[]>(existing?.sessions ?? []);
  const [repin, setRepin] = useState<RepinResult | null>(null);
  const [repinError, setRepinError] = useState<string | null>(null);
  const [repinning, setRepinning] = useState(false);
  // Every save goes through one gate: an update of this hall, the creation of a new one, and taking
  // the new hall's stored copy into the editor. A second save in between could otherwise write to a
  // hall the page no longer edits, or put the answer of the old hall on the new hall's panel. The gate
  // checks synchronously; its state disables the header button.
  const [saveState, setSaveState] = useState<SaveGateState>('idle');
  const [gate] = useState(() => createSaveGate(setSaveState));
  const [copyNotLoaded, setCopyNotLoaded] = useState(false);
  const refuseSave = (): never => {
    throw new Error(gate.state === 'blocked' ? texts.copyNotLoaded : texts.saveBusy);
  };
  /**
   * The editor takes the new hall exactly as the server stored it. If it cannot, it still holds the
   * hall it came from, so saves stay blocked: one would write that hall over the new one.
   */
  const adoptStored = (stored: HallResponse, sent: HallConfig): void => {
    if (adoptStoredHall(editorRef.current, stored, sent)) {
      gate.end();
    } else {
      gate.block();
      setCopyNotLoaded(true);
    }
  };
  const draftKey = draftKeyOf(hallId ?? draftId);
  // The open save question, readable at once: while it waits for an answer no other save starts (a
  // second question would replace it and leave its answer unresolved). When the page goes away with
  // the dialog open, the answer is "cancel": nothing is saved.
  const pending = useRef<SaveQuestion | null>(null);
  useEffect(() => () => pending.current?.resolve({ kind: 'cancel' }), []);
  // False once the page has been left: a save that finishes afterwards changes nothing on the page,
  // and it does not rewrite the address of the page the user went to.
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

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
      if (!scope.owns(id)) return;
      if (isSessionsList(body)) setSessions(body.sessions);
    } catch {
      // The panel then offers the home page instead of a session link.
    }
  };

  const ask = (mode: SaveQuestion['mode']): Promise<SaveAnswer> =>
    new Promise((resolve) => {
      // Read now: once the dialog is open, its name field has the focus and the button is disabled.
      const focused = document.activeElement;
      const opener = focused instanceof HTMLElement && focused !== document.body ? focused : null;
      const next: SaveQuestion = { mode, resolve, opener };
      pending.current = next;
      setQuestion(next);
    });

  const answer = (value: SaveAnswer): void => {
    const open = pending.current;
    pending.current = null;
    setQuestion(null);
    open?.resolve(value);
  };

  /** Creates a new hall from the text. Nothing on the page changes yet (see `switchToCreated`). */
  const createHall = async (yaml: string, name: string | undefined): Promise<CreatedHall> => {
    const response = await fetch('/api/halls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yaml, asNew: true, ...(name ? { name } : {}) }),
    });
    const body: unknown = await response.json();
    if (!isCreateHallResponse(body)) throw new Error(`POST halls: ${response.status}`);
    if (!body.ok) {
      const first = body.issues?.find((issue) => issue.severity === 'error');
      throw new Error(first ? `${body.message} ${first.text}` : body.message);
    }
    return body;
  };

  /**
   * Afterwards this page edits the new hall: its id, name, address and save panel. Only while the
   * page is still open. The stored draft of the hall the page came from goes only when it holds
   * what was just saved: a draft still offered for restore was never taken into the editor, so it
   * stays with that hall (and is offered again there), and its offer is not carried over to the new
   * hall.
   */
  const switchToCreated = (created: CreatedHall, copyOf: string | undefined): void => {
    if (draftOfferRef.current === null) clearDraft(draftKey);
    if (!active.current) return;
    setDraftOffer(null);
    setRestoreFailed(false);
    scope.set(created.hall.id);
    setHallId(created.hall.id);
    setHallName(created.hall.name);
    setSample(false);
    setSaveMode('update');
    setSessions([]);
    setRepin(null);
    setSaved({
      rev: created.stored.revision,
      created: true,
      name: created.hall.name,
      ...(copyOf ? { copyOf } : {}),
      ...(created.requestedId && !copyOf ? { requestedId: created.requestedId } : {}),
    });
    // The address names the new hall, so a reload opens it rather than the template or the original.
    window.history.replaceState(
      null,
      '',
      `/constructor?hall=${encodeURIComponent(created.hall.id)}`,
    );
  };

  /**
   * A new hall from the save button (the gate is already taken). The editor marks `sent` as saved
   * when this returns; right after that it takes the stored copy (its id and header). Saves stay
   * blocked until it has.
   */
  const createFromSave = async (
    yaml: string,
    name: string | undefined,
    sent: HallConfig,
  ): Promise<{ ok: true; revision: number }> => {
    const copyOf = hallId === null ? undefined : hallName;
    let created: CreatedHall;
    try {
      created = await createHall(yaml, name);
    } catch (error) {
      gate.end();
      throw error;
    }
    switchToCreated(created, copyOf);
    window.setTimeout(() => {
      if (active.current) adoptStored(created.stored, sent);
    }, 0);
    return { ok: true, revision: created.stored.revision };
  };

  const updateHall = async (
    id: string,
    yaml: string,
    baseRevision: string | number | undefined,
  ): Promise<Awaited<ReturnType<SaveHandler>>> => {
    const response = await fetch(`/api/halls/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRevision, yaml }),
    });
    const body: unknown = await response.json();
    if (!isSaveResponse(body)) throw new Error(`POST hall: ${response.status}`);
    if (body.ok) {
      clearDraft(draftKey);
      setHallName(body.baseline?.name ?? editor.config.name);
      setSaved({ rev: body.revision, created: false, name: body.baseline?.name ?? hallName });
      setRepin(null);
      void loadSessions(id);
    }
    return body;
  };

  // Saving over a sample, or over a hall that showtimes use, needs an answer first.
  const needsAnswer = hallId !== null && saveMode === 'ask' && (sample || sessions.length > 0);

  const onSave: SaveHandler = async (sent, ctx) => {
    if (pending.current !== null) throw new Error(texts.answerSaveQuestion);
    if (gate.state !== 'idle') refuseSave();
    if (hallId === null) {
      // A new hall (template, copy or import into one) is created on its first save.
      if (!gate.begin()) refuseSave();
      return createFromSave(ctx.yaml, undefined, sent);
    }
    if (needsAnswer) {
      const choice = await ask('choose');
      if (choice.kind === 'cancel') throw new Error(texts.notSaved);
      if (choice.kind === 'new') {
        if (!gate.begin()) refuseSave();
        return createFromSave(ctx.yaml, choice.name, sent);
      }
      setSaveMode('update');
    }
    if (!gate.begin()) refuseSave();
    try {
      return await updateHall(hallId, ctx.yaml, ctx.revision);
    } finally {
      gate.end();
    }
  };

  /** The "Save as new hall" button: a copy under a new name; the hall it came from stays as it is. */
  const saveAsNew = async (): Promise<void> => {
    setSaveAsNewError(null);
    if (gate.state !== 'idle' || pending.current !== null) return;
    const choice = await ask('new');
    if (choice.kind !== 'new') return;
    if (!gate.begin()) return;
    // What is saved: the editor as it is now. Edits made while the request runs stay afterwards.
    const current = editorRef.current;
    const sent = current.config;
    const copyOf = hallName;
    let created: CreatedHall;
    try {
      created = await createHall(current.exportYaml(), choice.name);
    } catch (error) {
      setSaveAsNewError(error instanceof Error ? error.message : String(error));
      gate.end();
      return;
    }
    // The editor takes the new hall first, then the page names it (if the page is still open).
    if (active.current) adoptStored(created.stored, sent);
    switchToCreated(created, copyOf);
  };

  const moveFutureSessions = async (): Promise<void> => {
    const id = hallId;
    if (id === null) return;
    setRepinning(true);
    setRepinError(null);
    try {
      const response = await fetch(`/api/halls/${encodeURIComponent(id)}/repin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body: unknown = await response.json();
      if (!isRepinResponse(body)) throw new Error(`repin: ${response.status}`);
      // The page may edit a copy by now: the answer is about the hall that asked.
      if (scope.owns(id)) {
        if (body.ok) setRepin(body);
        else setRepinError(body.message);
      }
      await loadSessions(id);
    } catch {
      if (scope.owns(id)) setRepinError(t.common.networkError);
    }
    setRepinning(false);
  };

  const restoreDraft = (draft: Draft) => {
    // The stored-text limit, as the page uses for the hall itself: a draft of a hall at the upload
    // limit is a little larger once the server has written its id.
    const result = restoreDraftText(editor, draft.yaml);
    setDraftOffer(null);
    setRestoreFailed(!result.ok);
    if (!result.ok) clearDraft(draftKey);
  };

  const discardDraft = () => {
    clearDraft(draftKey);
    setDraftOffer(null);
  };

  const suggestedName =
    editor.config.name.trim() !== '' && editor.config.name !== hallName
      ? editor.config.name
      : copyName(hallName);

  return (
    <main className="constructor-page">
      <header className="constructor-header">
        <div>
          <p>
            <Link href="/">{t.common.allHalls}</Link>
          </p>
          <h1>
            {editor.config.name}
            {sample ? (
              <span className="badge" data-testid="sample-badge">
                {texts.sampleBadge}
              </span>
            ) : null}
          </h1>
          <p className="muted" data-testid="save-hint">
            {hallId === null
              ? texts.hintNew(origin ?? texts.aTemplate)
              : sample
                ? texts.hintSample
                : sessions.length > 0
                  ? texts.hintShowtimes(sessions.length)
                  : texts.hintUpdate}
          </p>
        </div>
        <div className="header-actions">
          {hallId !== null ? (
            <button
              type="button"
              className="button secondary"
              onClick={() => void saveAsNew()}
              disabled={hasErrors(editor.issues) || question !== null || saveState !== 'idle'}
              title={texts.saveAsNewTitle}
            >
              {texts.saveAsNew}
            </button>
          ) : null}
          {hallId !== null ? <ShowtimePicker hallId={hallId} sessions={sessions} /> : null}
        </div>
      </header>

      {copyNotLoaded ? (
        <p role="alert" className="notice" data-testid="copy-not-loaded">
          {texts.copyNotLoaded}
        </p>
      ) : null}

      {saveAsNewError ? (
        <p role="alert" className="notice">
          {texts.saveAsNewFailed(saveAsNewError)}
        </p>
      ) : null}

      {saved && hallId ? (
        <SavedPanel
          hallId={hallId}
          saved={saved}
          sessions={sessions}
          repin={repin}
          repinError={repinError}
          repinning={repinning}
          onRepin={() => void moveFutureSessions()}
        />
      ) : null}

      {question ? (
        <SaveDialog
          mode={question.mode}
          opener={question.opener}
          hallName={hallName}
          sample={sample}
          showtimes={sessions.length}
          suggestedName={suggestedName}
          onAnswer={answer}
        />
      ) : null}

      {draftOffer ? (
        <section className="panel draft-prompt" role="alertdialog" aria-labelledby="draft-title">
          <h2 id="draft-title">{texts.draftTitle}</h2>
          <p className="muted">
            {texts.draftText(new Date(draftOffer.savedAt).toLocaleString(LOCALE))}
          </p>
          <div className="actions">
            <button type="button" className="button" onClick={() => restoreDraft(draftOffer)}>
              {texts.restore}
            </button>
            <button type="button" className="button secondary" onClick={discardDraft}>
              {texts.discard}
            </button>
          </div>
        </section>
      ) : null}
      {restoreFailed ? (
        <p role="alert" className="notice">
          {texts.draftFailed}
        </p>
      ) : null}

      <HallConstructor
        editor={editor}
        locale={LOCALE}
        onSave={onSave}
        extraFields={EXTRA_FIELDS}
        fieldLimits={FIELD_LIMITS}
      />
    </main>
  );
}

/** "Open a showtime": the hall's showtimes to pick from, or a way to add the first one. */
function ShowtimePicker({ hallId, sessions }: { hallId: string; sessions: SessionView[] }) {
  const showtimesHref = `/halls/${encodeURIComponent(hallId)}/showtimes`;
  if (sessions.length === 0) {
    return (
      <p className="muted showtime-picker-empty" data-testid="no-showtimes">
        {t.editor.noShowtimesToBook} <Link href={showtimesHref}>{t.common.addShowtimes}</Link>
      </p>
    );
  }
  return (
    <details className="showtime-picker" data-testid="showtime-picker">
      <summary className="button secondary">{t.editor.openShowtime(sessions.length)}</summary>
      <ul className="chip-list">
        {sessions.map((session) => (
          <li key={session.id}>
            <Link href={`/sessions/${session.id}`} className="session-chip">
              {dateShort(session.date)} · {session.time} · {session.format}
            </Link>
          </li>
        ))}
      </ul>
      <p className="muted">
        <Link href={showtimesHref}>{t.common.addShowtimes}</Link>
      </p>
    </details>
  );
}

interface SaveDialogProps {
  mode: SaveQuestion['mode'];
  /** Gets the focus back when the dialog closes. */
  opener: HTMLElement | null;
  /** The saved name of the hall being edited. */
  hallName: string;
  sample: boolean;
  showtimes: number;
  suggestedName: string;
  onAnswer: (answer: SaveAnswer) => void;
}

/**
 * The question before a save that would change a sample hall or a hall with showtimes: what
 * happens either way, in plain words, with "Save as new hall" and "Update this hall".
 */
function SaveDialog({
  mode,
  opener,
  hallName,
  sample,
  showtimes,
  suggestedName,
  onAnswer,
}: SaveDialogProps) {
  const texts = t.editor;
  const [name, setName] = useState(suggestedName);
  const trimmed = name.trim();
  const backdrop = useRef<HTMLDivElement>(null);
  // Modal for the keyboard too: the page behind is inert while the question is open, so Tab cannot
  // reach the toolbar's Save button. Focus goes back to the button that opened it when it closes
  // (read when the question was asked: by now the name field has the focus).
  useEffect(() => {
    const element = backdrop.current;
    if (!element) return undefined;
    const restore = makeOthersInert(element);
    return () => {
      restore();
      if (opener?.isConnected) opener.focus();
    };
  }, [opener]);
  return (
    <div className="dialog-backdrop" ref={backdrop}>
      <section
        className="panel save-dialog"
        role="dialog"
        aria-modal="true"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onAnswer({ kind: 'cancel' });
          }
        }}
        aria-labelledby="save-dialog-title"
        data-testid="save-dialog"
      >
        <h2 id="save-dialog-title">
          {mode === 'new' ? texts.dialogNewTitle : texts.dialogChooseTitle(hallName)}
        </h2>
        {mode === 'new' ? (
          <p className="muted">{texts.dialogNewText(hallName)}</p>
        ) : sample ? (
          <p className="muted">{texts.dialogSampleText(hallName, showtimes)}</p>
        ) : (
          <p className="muted">{texts.dialogShowtimesText(hallName, showtimes)}</p>
        )}
        <form
          className="save-dialog-new"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed) onAnswer({ kind: 'new', name: trimmed });
          }}
        >
          <label className="field">
            <span>{texts.newHallName}</span>
            <input
              type="text"
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </label>
          <div className="actions">
            <button
              type="submit"
              className={mode === 'new' || sample ? 'button' : 'button secondary'}
              disabled={trimmed === ''}
            >
              {texts.saveAsNew}
            </button>
            {mode === 'choose' ? (
              <button
                type="button"
                className={sample ? 'button secondary' : 'button'}
                onClick={() => onAnswer({ kind: 'update' })}
              >
                {sample ? texts.updateSample : texts.updateHall}
              </button>
            ) : null}
            <button
              type="button"
              className="button secondary"
              onClick={() => onAnswer({ kind: 'cancel' })}
            >
              {texts.cancel}
            </button>
          </div>
        </form>
      </section>
    </div>
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

/** After a save: what happened, what it means for the showtimes, and the next step. */
function SavedPanel({
  hallId,
  saved,
  sessions,
  repin,
  repinError,
  repinning,
  onRepin,
}: SavedPanelProps) {
  const texts = t.editor;
  const outdated = sessions.filter((session) => session.versionRev < saved.rev).length;
  // A showtime the last move refused for a sold seat cannot be moved by pressing again; one refused
  // only for temporary holds can, once they end. The button stays while some showtime may move.
  const movable = movableCount(sessions, saved.rev, repin);
  const showtimesHref = `/halls/${encodeURIComponent(hallId)}/showtimes`;
  return (
    <section className="panel saved-panel" role="status" data-testid="saved-panel">
      <h2>
        {saved.created ? texts.created(saved.name) : texts.changesSaved}
        <span className="muted saved-version">{texts.savedVersion(saved.rev)}</span>
      </h2>
      {saved.copyOf ? <p className="muted">{texts.unchanged(saved.copyOf)}</p> : null}
      {saved.requestedId ? (
        <p className="muted" data-testid="renamed-note">
          {texts.renamed(saved.requestedId, hallId)}
        </p>
      ) : null}

      {sessions.length === 0 ? (
        <p className="muted">{saved.created ? texts.nextStepCreated : texts.nextStepNoShowtimes}</p>
      ) : outdated > 0 ? (
        <div className="repin-explain" data-testid="repin-explain">
          <p>{texts.outdated(outdated, sessions.length)}</p>
          <p className="muted">{texts.repinExplain}</p>
        </div>
      ) : (
        <p className="muted">{texts.allUseVersion(sessions.length)}</p>
      )}

      <div className="actions">
        {movable > 0 ? (
          <button type="button" className="button" disabled={repinning} onClick={onRepin}>
            {texts.moveFuture}
          </button>
        ) : null}
        <Link
          href={showtimesHref}
          className={movable > 0 ? 'button secondary' : 'button'}
          data-testid="saved-add-showtimes"
        >
          {t.common.addShowtimes}
        </Link>
        <Link
          href={`/?new=${encodeURIComponent(hallId)}#hall-${encodeURIComponent(hallId)}`}
          className="button secondary"
        >
          {texts.allHalls}
        </Link>
      </div>
      {sessions.length > 0 ? (
        <div className="saved-showtimes">
          <p className="chips-title">{texts.openBooking}</p>
          <ul className="chip-list">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={`/sessions/${session.id}`}
                  className="session-chip"
                  data-testid="saved-session-chip"
                  data-session-id={session.id}
                >
                  {dateShort(session.date)} · {session.time} · {session.format}
                  {session.versionRev !== saved.rev ? ` · v${session.versionRev}` : ''}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
  const texts = t.editor;
  return (
    <div className="repin-report" data-testid="repin-report">
      <p>
        {texts.repinMoved(result.toRev)}
        <strong>{result.moved.length}</strong>
        {result.refused.length > 0 ? texts.repinKept(result.refused.length) : ''}
        {result.unchanged > 0 ? texts.repinUnchanged(result.unchanged) : ''}.
      </p>
      {result.refused.length > 0 ? (
        <ul>
          {result.refused.map((entry) => {
            const seats = entry.seats ?? entry.keys;
            return (
              <li
                key={entry.sessionId}
                data-testid="repin-refused"
                data-session-id={entry.sessionId}
              >
                {texts.repinRefused(
                  entry.showtime ?? texts.aShowtime,
                  seats.slice(0, SHOWN_KEYS).join(', '),
                  Math.max(0, seats.length - SHOWN_KEYS),
                  seats.length,
                )}
                {entry.retryable === true ? ` ${texts.repinRetryLater}` : ''}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
