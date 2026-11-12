import { useState } from 'react';
import { type HallTemplate, type Issue } from '@cinema-hall/core';
import { formatLabel } from '../../labels/labels.js';
import type { EditorLabels } from '../../labels/editor-labels.js';
import { partClass } from '../../provider/provider.js';
import { useHallEditorContext } from '../context.js';
import type { SaveController } from '../save/use-save.js';
import { describeIssue } from '../issues-view.js';
import { copyText, downloadText } from './export.js';
import { ImportDialog } from './ImportDialog.js';
import { TextField } from '../fields/TextField.js';
import { TemplateMenu } from './TemplateMenu.js';

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
  const [note, setNote] = useState<string | null>(null);
  const fileName = `${editor.config.id ?? 'hall'}.yaml`;
  const errorCount = [...editor.issues, ...save.serverIssues].filter(
    (issue) => issue.severity === 'error',
  ).length;
  const blockedByErrors = errorCount > 0;

  const applyTemplate = (template: HallTemplate): void => {
    if (readOnly) return;
    const first = editor.replace(template.create())[0];
    setNote(null);
    // A rejection goes to the visible notice, which a stale save error cannot hide.
    ctx.notify(
      first ? formatLabel(L.rejected, { reason: describeIssue(first, L, options.locale) }) : null,
    );
  };

  const download = (): void => {
    const done = downloadText(editor.exportYaml(), fileName);
    setNote(done ? null : formatLabel(L.copyFailed));
  };

  const copy = async (): Promise<void> => {
    const done = await copyText(editor.exportYaml());
    setNote(formatLabel(done ? L.copied : L.copyFailed));
  };

  const startSave = (): void => {
    // A notice from an earlier action is obsolete once the user saves; the save's own answer shows.
    setNote(null);
    void save.save();
  };

  const saveLabel = save.saving ? L.saving : save.status === 'saved' ? L.saved : L.save;
  // A current save answer outranks a notice: a failed save must not hide behind "Imported".
  const status =
    saveMessage(save, L) ??
    note ??
    (save.enabled && blockedByErrors ? formatLabel(L.saveBlocked) : null);

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
        <div data-chk="editor-name">
          <TextField
            path={['name']}
            label={formatLabel(L.name)}
            value={editor.config.name}
            onCommit={(name) => editor.patch({ name })}
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
              ctx.notify(describeRejections(editor.history.undo(), L, options.locale));
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
              ctx.notify(describeRejections(editor.history.redo(), L, options.locale));
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
              {editor.dirty && !readOnly ? (
                <span data-chk="editor-dirty" aria-hidden="true" />
              ) : null}
              {formatLabel(saveLabel)}
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
        <p role="status" data-chk="editor-status">
          {status}
        </p>
      ) : null}
      {editor.dirty && !readOnly ? (
        <span className="chk-visually-hidden">{formatLabel(L.unsaved)}</span>
      ) : null}
      {importOpen && !readOnly ? (
        <ImportDialog
          onClose={(message) => {
            setImportOpen(false);
            setNote(message);
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
): string | null {
  const first = issues[0];
  return first ? formatLabel(L.rejected, { reason: describeIssue(first, L, locale) }) : null;
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
