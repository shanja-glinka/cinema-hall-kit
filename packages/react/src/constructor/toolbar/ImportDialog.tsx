import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { formatLabel } from '../../labels/labels.js';
import { useHallEditorContext } from '../context.js';
import { describeIssue } from '../issues-view.js';

/**
 * Props of the import dialog.
 */
export interface ImportDialogProps {
  /** Called with the success message after an import, or `null` when cancelled. */
  onClose: (message: string | null) => void;
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])';

/**
 * Marks everything outside `shell` as inert, so the page behind the dialog cannot be reached by
 * mouse, keyboard or assistive technology. Returns the function that undoes it.
 */
function makeBackgroundInert(shell: Element): () => void {
  const changed: Element[] = [];
  let node: Element = shell;
  while (node !== document.body && node.parentElement) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling !== node && !sibling.hasAttribute('inert')) {
        sibling.setAttribute('inert', '');
        changed.push(sibling);
      }
    }
    node = node.parentElement;
  }
  return () => {
    for (const element of changed) element.removeAttribute('inert');
  };
}

/**
 * Paste or file import. A failed import keeps the hall unchanged and lists each error with its
 * position. While it is open the page behind it is inert; focus starts in the dialog, stays in it,
 * and returns to the control that opened it.
 * @param props `onClose` receives a notice for the toolbar, or null.
 * @param props.onClose Called when the dialog closes, with a notice for the toolbar or null.
 * @returns The modal dialog.
 * @example <ImportDialog onClose={(message) => setNote(message)} />
 */
export function ImportDialog({ onClose }: ImportDialogProps) {
  const { editor, options, readOnly } = useHallEditorContext();
  const L = options.labels.editor;
  const { Button } = options.slots;
  const titleId = useId();
  const shellRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // Every text change and every file choice takes a new revision; a file read that finishes after
  // a newer one (or after typing) is stale and is dropped.
  const revision = useRef(0);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const release = shellRef.current ? makeBackgroundInert(shellRef.current) : () => undefined;
    textRef.current?.focus();
    return () => {
      release();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const readFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    revision.current += 1;
    const mine = revision.current;
    const content = await file.text();
    if (mine !== revision.current) return;
    setText(content);
    setErrors([]);
  };

  const apply = (): void => {
    // Read-only can start after the dialog opened: the import is refused and the dialog closes.
    if (readOnly) {
      onClose(null);
      return;
    }
    const result = editor.importText(text);
    if (result.ok) {
      onClose(formatLabel(L.importDone));
      return;
    }
    setErrors(
      result.issues.map((issue) => {
        const where = issue.position
          ? `${formatLabel(L.position, { line: issue.position.line, col: issue.position.col })}: `
          : '';
        return where + describeIssue(issue, L, options.locale, options.labels.issues);
      }),
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      onClose(null);
      return;
    }
    if (event.key !== 'Tab' || !shellRef.current) return;
    const items = Array.from(shellRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div ref={shellRef} data-chk="editor-dialog-backdrop" onKeyDown={onKeyDown}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} data-chk="editor-dialog">
        <h3 id={titleId}>{formatLabel(L.importTitle)}</h3>
        <p>{formatLabel(L.importHint)}</p>
        <input
          type="file"
          accept=".yaml,.yml,.json"
          aria-label={formatLabel(L.importFile)}
          onChange={(event) => void readFile(event)}
        />
        <textarea
          ref={textRef}
          aria-label={formatLabel(L.importTitle)}
          value={text}
          rows={12}
          spellCheck={false}
          onChange={(event) => {
            revision.current += 1;
            setText(event.target.value);
          }}
        />
        {errors.length > 0 ? (
          <ul role="alert" data-chk="editor-errors">
            {errors.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        ) : null}
        <div data-chk="editor-dialog-actions">
          <Button type="button" variant="primary" disabled={text.trim() === ''} onClick={apply}>
            {formatLabel(L.importApply)}
          </Button>
          <Button type="button" variant="secondary" onClick={() => onClose(null)}>
            {formatLabel(L.cancel)}
          </Button>
        </div>
      </div>
    </div>
  );
}
