import { useEffect, useState } from 'react';
import { type HallTemplate, type Issue, type IssueMessages } from '@cinema-hall/core';
import { formatLabel } from '../../labels/labels.js';
import type { EditorLabels } from '../../labels/editor-labels.js';
import { partClass } from '../../provider/provider.js';
import { useHallEditorContext } from '../context.js';
import type { SaveController } from '../save/use-save.js';
import { describeIssue, issueFix } from '../issues-view.js';
import { IssueFixButton } from '../ui/IssueFixButton.js';
import { copyText, downloadText } from './export.js';
import { ImportDialog } from './ImportDialog.js';
import { TextField } from '../fields/TextField.js';
import { TemplateMenu } from './TemplateMenu.js';
import { editorConstraints, latestConfig } from '../editor/use-hall-editor.js';
import type { HallConfig } from '@cinema-hall/core';
import { editorLabel } from '../../labels/editor-labels.js';

/** How long a confirmation in the status line ("Imported", "YAML copied") stays, in milliseconds. */
export const NOTE_MS = 5000;

/** A toolbar status line: its text, its tone, and the hall it was about. */
interface Note {
  text: string;
  tone: 'success' | 'error';
  /** The hall when the note was made: the next edit makes the note obsolete. */
  config: HallConfig;
}

/** Host templates and an optional toolbar class. */
export interface HallConstructorToolbarProps {
  /** Templates for the "Start from template" menu. */
  templates?: readonly HallTemplate[];
  className?: string;
}

function saveMessage(save: SaveController, L: EditorLabels): string | null {
  switch (save.status) {
    case 'invalid':
      return formatLabel(L.saveInvalid);
    case 'conflict':
      return formatLabel(L.saveConflict);
    case 'in_use':
      return formatLabel(L.saveInUse);
    case 'error':
      return formatLabel(L.saveError, { message: save.message ?? '' });
    default:
      return null;
  }
}

/**
 * Hall name, dimensions, file actions, history and revision-aware save controls.
 * @param props Host templates and an optional class.
 * @param props.templates Templates offered by the template menu.
 * @param props.className Class appended to the part.
 * @returns The constructor toolbar and any active save banner or import dialog.
 * @example <HallConstructorToolbar templates={builtInTemplates} />
 */
export function HallConstructorToolbar({ templates = [], className }: HallConstructorToolbarProps) {
  const ctx = useHallEditorContext();
  const { editor, options, readOnly, save } = ctx;
  const L = options.labels.editor;
  const { Button, Chip } = options.slots;
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [note, setNoteState] = useState<Note | null>(null);
  const setNote = (text: string | null, tone: Note['tone'] = 'error'): void => {
    setNoteState(text === null ? null : { text, tone, config: latestConfig(editor) });
  };
  // A confirmation goes away after a few seconds; any note goes away with the next edit.
  useEffect(() => {
    if (note === null) return undefined;
    if (note.config !== editor.config) {
      setNoteState(null);
      return undefined;
    }
    if (note.tone !== 'success') return undefined;
    const timer = setTimeout(() => setNoteState(null), NOTE_MS);
    return () => clearTimeout(timer);
  }, [note, editor.config]);
  // A save succeeded and nothing was edited since: the clean state is the saved one.
  const [savedSession, setSavedSession] = useState(false);
  useEffect(() => {
    if (save.status === 'saved') setSavedSession(true);
    else if (editor.dirty) setSavedSession(false);
  }, [save.status, editor.dirty]);
  const fileName = `${editor.config.id ?? 'hall'}.yaml`;
  const errorCount = [...editor.issues, ...save.serverIssues].filter(
    (issue) => issue.severity === 'error',
  ).length;
  const blockedByErrors = errorCount > 0;
  // An error the editor can fix in one click (a hall too small for its seats) offers it here too.
  const fixable = [...editor.issues, ...save.serverIssues].find(
    (issue) =>
      issue.severity === 'error' &&
      issueFix(issue, { config: editor.config, constraints: editorConstraints(editor) }) !== null,
  );

  const applyTemplate = (template: HallTemplate): void => {
    if (readOnly) return;
    const first = editor.replace(template.create())[0];
    setNote(null);
    // A rejection goes to the visible notice, which a stale save error cannot hide.
    ctx.notify(
      first
        ? formatLabel(L.rejected, {
            reason: describeIssue(first, L, options.locale, options.labels.issues),
          })
        : null,
    );
  };

  const download = (): void => {
    const done = downloadText(editor.exportYaml(), fileName);
    setNote(done ? null : formatLabel(L.copyFailed));
  };

  const copy = async (): Promise<void> => {
    const done = await copyText(editor.exportYaml());
    setNote(formatLabel(done ? L.copied : L.copyFailed), done ? 'success' : 'error');
  };

  const startSave = (): void => {
    // A notice from an earlier action is obsolete once the user saves; the save's own answer shows.
    setNote(null);
    void save.save();
  };

  // "Saved" stays after a successful save while nothing has changed since, also when the host then
  // installs the server's text of the saved hall (a new baseline), until the next edit.
  const showSaved = !editor.dirty && (save.status === 'saved' || savedSession);
  const saveLabel = save.saving ? L.saving : showSaved ? L.saved : L.save;
  // A current save answer outranks a notice: a failed save must not hide behind "Imported".
  const failure = saveMessage(save, L);
  const status: { text: string; tone: Note['tone'] } | null =
    failure !== null
      ? { text: failure, tone: 'error' }
      : note !== null
        ? { text: note.text, tone: note.tone }
        : save.enabled && blockedByErrors
          ? { text: formatLabel(L.saveBlocked), tone: 'error' }
          : null;
  const saveState =
    readOnly || save.saving
      ? null
      : editor.dirty
        ? { state: 'dirty', text: formatLabel(L.unsaved) }
        : showSaved
          ? { state: 'saved', text: formatLabel(editorLabel(L, 'allSaved')) }
          : null;

  return (
    <header
      className={partClass(
        options,
        'editorToolbar',
        ['chk-glass', className].filter(Boolean).join(' '),
      )}
      data-chk="editor-toolbar"
    >
      <div data-chk="editor-toolbar-main">
        <div data-chk="editor-name" title={editor.config.name}>
          <TextField
            path={['name']}
            label={formatLabel(L.name)}
            value={editor.config.name}
            onCommit={(name) => editor.patch({ name })}
            showApplied={false}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => ctx.selection.select({ kind: 'hall' })}
        >
          {formatLabel(L.hallDimensions, {
            width: editor.config.hall.width,
            depth: editor.config.hall.depth,
            height: editor.config.hall.height,
          })}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => ctx.selection.select({ kind: 'screen' })}
        >
          {formatLabel(L.screenDimensions, {
            width: editor.config.screen.width,
            height: editor.config.screen.height,
          })}
        </Button>
        {readOnly ? <Chip tone="neutral">{formatLabel(L.readOnly)}</Chip> : null}
        {/* Always rendered at the width of its longest text, so the buttons do not move when the
            state appears, changes or goes; the sizes are CSS-only text, outside the text content. */}
        {readOnly ? null : (
          <span data-chk="editor-save-state" data-state={saveState?.state} aria-live="polite">
            <span
              data-chk="editor-save-state-text"
              data-size-unsaved={formatLabel(L.unsaved)}
              data-size-saved={formatLabel(editorLabel(L, 'allSaved'))}
            >
              {saveState?.text ?? ''}
            </span>
          </span>
        )}
      </div>
      <div data-chk="editor-toolbar-tools">
        {templates.length > 0 ? (
          <TemplateMenu templates={templates} disabled={readOnly} onPick={applyTemplate} />
        ) : null}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={readOnly}
          onClick={() => setImportOpen(true)}
        >
          {formatLabel(L.importAction)}
        </Button>
        <div
          data-chk="editor-menu-wrap"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setExportOpen(false);
          }}
        >
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-expanded={exportOpen}
            onClick={() => setExportOpen(!exportOpen)}
          >
            {formatLabel(L.exportAction)}
          </Button>
          {exportOpen ? (
            <div data-chk="editor-menu" role="group" aria-label={formatLabel(L.exportAction)}>
              <Button type="button" variant="ghost" size="sm" onClick={download}>
                {formatLabel(L.download)}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => void copy()}>
                {formatLabel(L.copy)}
              </Button>
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => ctx.selection.select({ kind: 'seatTypes' })}
        >
          {formatLabel(L.seatTypesPrices)}
        </Button>
        <span title={formatLabel(L.undoTip)} data-chk="editor-icon-wrap">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={readOnly || !editor.history.canUndo}
            aria-label={formatLabel(L.undo)}
            onClick={() => {
              setNote(null);
              ctx.notify(
                describeRejections(editor.history.undo(), L, options.locale, options.labels.issues),
              );
            }}
          >
            <HistoryIcon />
          </Button>
        </span>
        <span title={formatLabel(L.redoTip)} data-chk="editor-icon-wrap">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={readOnly || !editor.history.canRedo}
            aria-label={formatLabel(L.redo)}
            onClick={() => {
              setNote(null);
              ctx.notify(
                describeRejections(editor.history.redo(), L, options.locale, options.labels.issues),
              );
            }}
          >
            <HistoryIcon flip />
          </Button>
        </span>
        {save.enabled ? (
          <span
            title={blockedByErrors ? formatLabel(L.saveBlocked) : undefined}
            data-chk="editor-save-wrap"
          >
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={save.blocked || blockedByErrors}
              onClick={startSave}
            >
              {/* The dot keeps its place when hidden, and the label is as wide as its longest
                  text, so the buttons before Save do not move when the state changes. */}
              <span
                data-chk="editor-dirty"
                data-on={(editor.dirty && !readOnly) || undefined}
                aria-hidden="true"
              />
              <span
                data-chk="editor-save-label"
                data-size-a={formatLabel(L.save)}
                data-size-b={formatLabel(L.saved)}
              >
                <span data-chk="editor-save-label-text" data-size-c={formatLabel(L.saving)}>
                  {formatLabel(saveLabel)}
                </span>
              </span>
              {blockedByErrors ? (
                <span> · {formatLabel(L.errorCount, { count: errorCount })}</span>
              ) : null}
            </Button>
          </span>
        ) : null}
        {save.status === 'conflict' && !readOnly ? (
          <Button type="button" variant="secondary" size="sm" onClick={save.loadServer}>
            {formatLabel(L.loadServer)}
          </Button>
        ) : null}
      </div>
      {status ? (
        <p role="status" data-chk="editor-status" data-tone={status.tone}>
          {status.text}
          {fixable ? <IssueFixButton issue={fixable} /> : null}
        </p>
      ) : null}
      {importOpen && !readOnly ? (
        <ImportDialog
          onClose={(message) => {
            setImportOpen(false);
            setNote(message, 'success');
          }}
        />
      ) : null}
    </header>
  );
}

/** The first rejection of a history step, as a notice; `null` when the step was applied. */
function describeRejections(
  issues: readonly Issue[],
  L: EditorLabels,
  locale: string | undefined,
  messages: IssueMessages | undefined,
): string | null {
  const first = issues[0];
  return first
    ? formatLabel(L.rejected, { reason: describeIssue(first, L, locale, messages) })
    : null;
}

/** A 20 px curved-arrow icon; `flip` mirrors it into redo. Drawn with strokes only. */
function HistoryIcon({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      data-chk="editor-icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      transform={flip ? 'scale(-1 1)' : undefined}
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}
