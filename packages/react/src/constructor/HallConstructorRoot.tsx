import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChkScope, partClass, rootProps, useCinemaHall } from '../provider/provider.js';
import { HallEditorContext, type HallEditorContextValue } from './context.js';
import { useSaveController } from './save/use-save.js';
import { formatLabel } from '../labels/labels.js';
import { describeIssue } from './issues-view.js';
import { rebasePath, selectionForIssue, type ConstructorSelection } from './selection.js';
import type { HallConstructorRootProps } from './types.js';
import { useBeforeUnload, useFocusControl, useWideLayout } from './ui/hooks.js';

const TEXT_INPUT_TYPES: readonly string[] = [
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
];

/** Inside a text field Ctrl/Cmd+Z belongs to the browser's own undo. */
function isTextEntry(target: EventTarget): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && TEXT_INPUT_TYPES.includes(target.type);
}

/**
 * Provides the editor, the resolved theme and labels, the save flow and the focus state to the
 * constructor's parts. Put `HallConstructorToolbar`, `HallConstructorCanvas`, `HallConstructorInspector`
 * and `HallConstructorIssues` inside it, in any layout you like.
 * @param props Editor, options and children.
 * @returns A scoped constructor root.
 * @example <HallConstructorRoot editor={editor}><HallConstructorCanvas /></HallConstructorRoot>
 */
export function HallConstructorRoot(props: HallConstructorRootProps) {
  const {
    editor,
    children,
    readOnly = false,
    extraFields = [],
    fieldLimits = {},
    view: initialView = '2d',
    onSave,
    warnOnUnload = true,
    className,
    style,
    theme,
    labels,
    locale,
    slots,
    classNames,
    formatPrice,
  } = props;
  const options = useCinemaHall({ theme, labels, locale, slots, classNames, formatPrice });
  const rootRef = useRef<HTMLDivElement>(null);
  const wide = useWideLayout(rootRef);
  const [view, setView] = useState(initialView);
  const [selected, setSelected] = useState<ConstructorSelection | null>(null);
  const [exclusion, setExclusion] = useState(false);
  const [notice, notify] = useState<string | null>(null);
  const select = useCallback((next: ConstructorSelection) => {
    setSelected(next);
    setExclusion(false);
  }, []);
  const clear = useCallback(() => {
    setSelected(null);
    setExclusion(false);
  }, []);
  // A removal, import or undo may make the stable reference disappear.
  const valid =
    selected?.kind === 'section'
      ? editor.config.layout.bands.some(
          (b) => b.id === selected.bandId && b.sections.some((s) => s.id === selected.sectionId),
        )
      : selected?.kind === 'band'
        ? editor.config.layout.bands.some((b) => b.id === selected.bandId)
        : true;
  const selection = useMemo(
    () => ({ selection: valid ? selected : null, select, clear }),
    [valid, selected, select, clear],
  );
  const focus = useFocusControl(
    rootRef,
    (path, ref) => {
      select(selectionForIssue(editor.config, path, ref));
    },
    (path, ref) => rebasePath(editor.config, path, ref),
  );
  const save = useSaveController(editor, onSave, readOnly);
  useBeforeUnload(warnOnUnload && !readOnly && editor.dirty);

  const value = useMemo<HallEditorContextValue>(
    () => ({
      editor,
      options,
      readOnly,
      view,
      setView,
      selection,
      exclusion,
      setExclusion,
      notice,
      notify,
      extraFields,
      fieldLimits,
      save,
      focus,
      wide,
      rootRef,
    }),
    [
      editor,
      options,
      readOnly,
      view,
      selection,
      exclusion,
      notice,
      extraFields,
      fieldLimits,
      save,
      focus,
      wide,
    ],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      clear();
      return;
    }
    if (readOnly || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
    if (isTextEntry(event.target)) return;
    event.preventDefault();
    // A refused step (a locked field) is reported like any other rejected action.
    const issues = event.shiftKey ? editor.history.redo() : editor.history.undo();
    const first = issues[0];
    notify(first ? describeIssue(first, options.labels.editor, options.locale) : null);
  };

  return (
    <ChkScope value={options}>
      <HallEditorContext.Provider value={value}>
        <div
          ref={rootRef}
          {...rootProps(options, { className: partClass(options, 'editor', className), style })}
          data-chk="editor"
          data-layout={wide ? 'wide' : 'narrow'}
          onKeyDown={onKeyDown}
        >
          {children}
          {notice !== null ? (
            <div role="alert" className="chk-glass" data-chk="editor-notice">
              <span>{notice}</span>
              <options.slots.Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={formatLabel(options.labels.editor.dismiss)}
                onClick={() => notify(null)}
              >
                ×
              </options.slots.Button>
            </div>
          ) : null}
        </div>
      </HallEditorContext.Provider>
    </ChkScope>
  );
}
