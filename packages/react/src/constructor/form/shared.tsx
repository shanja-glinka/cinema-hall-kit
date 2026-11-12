import { useState, type DragEvent } from 'react';
import type { FieldKey, HallConfig, Issue } from '@cinema-hall/core';
import { useHallEditorContext } from '../context.js';
import type { HallEditor } from '../editor/types.js';
import type { FieldPath } from '../fields/use-field.js';
import type { SelectOption } from '../fields/SelectField.js';
import { describeIssue } from '../issues-view.js';
import { formatLabel } from '../../labels/labels.js';

/**
 * Runs a list action: a rejection is shown to the user as a dismissible notice; an accepted action
 * clears it, moves focus to `focus` (the item the action made) and may announce its new position.
 * @returns The move `announcement` and `run(issues, focus?, announce?)`.
 * @example const { run } = useActionRunner();
 */
export function useActionRunner() {
  const ctx = useHallEditorContext();
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const run = (issues: Issue[], focus?: FieldPath, announce?: string): void => {
    const first = issues[0];
    if (first) {
      ctx.notify(describeIssue(first, ctx.options.labels.editor, ctx.options.locale));
      setAnnouncement(null);
      return;
    }
    ctx.notify(null);
    setAnnouncement(announce ?? null);
    if (focus) ctx.focus.requestFocus(focus);
  };
  return { announcement, run };
}

/**
 * The announcement of an accepted move (live region). Rejections go to the constructor notice.
 * @param props `announcement` to show.
 * @param props.announcement Text announced after an accepted move.
 * @returns The live region, or nothing.
 * @example <ActionNote announcement={announcement} />
 */
export function ActionNote({ announcement = null }: { announcement?: string | null }) {
  return announcement !== null ? (
    <p aria-live="polite" data-chk="editor-message">
      {announcement}
    </p>
  ) : null;
}

/**
 * Editing is off for the whole constructor, or for this structural group of the policy.
 * @param editor Editor holding the policy.
 * @param key Structural policy key.
 * @param readOnly Whole-constructor read-only flag.
 * @returns True when editing is off.
 */
export function isLocked(editor: HallEditor, key: FieldKey, readOnly: boolean): boolean {
  return readOnly || (editor.policy[key] ?? 'editable') !== 'editable';
}

/**
 * A hidden structural group is not offered at all; a locked one is shown with its controls disabled.
 * @param editor Editor holding the policy.
 * @param key Structural policy key.
 * @returns True when the group must not be offered.
 */
export function isHidden(editor: HallEditor, key: FieldKey): boolean {
  return (editor.policy[key] ?? 'editable') === 'hidden';
}

/**
 * Options of a seat-type select, labelled with the type labels.
 * @param config Current hall.
 * @returns One option per seat type.
 */
export function seatTypeOptions(config: HallConfig): SelectOption[] {
  return Object.entries(config.seatTypes).map(([id, def]) => ({ value: id, label: def.label }));
}

/**
 * Props of the list-item controls.
 */
export interface RowControlsProps {
  name: string;
  index: number;
  count: number;
  locked: boolean;
  /** Hidden by the policy: no control is rendered. */
  hidden?: boolean;
  /** Starts a drag-and-drop reorder. Omitted for items that cannot be dragged. */
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onMove: (toIndex: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

/**
 * A drag handle, then up, down, duplicate and remove for one list item. The buttons are real
 * buttons, so the keyboard reorders too; the handle is for pointers only.
 * @param props Item name, position, lock state and action handlers.
 * @param props.name Name of the item, for accessible labels.
 * @param props.index Position of the item.
 * @param props.count Number of items.
 * @param props.locked Whether the controls are disabled.
 * @param props.hidden Whether no control is rendered.
 * @param props.onDragStart Starts a pointer drag reorder; omitted for items that cannot be dragged.
 * @param props.onMove Moves the item to a position.
 * @param props.onDuplicate Copies the item.
 * @param props.onRemove Removes the item.
 * @returns The control row, or nothing when hidden.
 * @example <RowControls name="Zone" index={0} count={2} locked={false} onMove={move} onDuplicate={copy} onRemove={drop} />
 */
export function RowControls({
  name,
  index,
  count,
  locked,
  hidden = false,
  onDragStart,
  onMove,
  onDuplicate,
  onRemove,
}: RowControlsProps) {
  const ctx = useHallEditorContext();
  const L = ctx.options.labels.editor;
  const { Button } = ctx.options.slots;
  if (hidden) return null;
  return (
    <div data-chk="editor-row-controls">
      {onDragStart ? (
        <span
          data-chk="editor-drag"
          draggable={!locked}
          aria-hidden="true"
          title={formatLabel(L.dragHandle)}
          onDragStart={locked ? undefined : onDragStart}
        >
          ⋮⋮
        </span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={locked || index === 0}
        aria-label={formatLabel(L.moveUpNamed, { name })}
        onClick={() => onMove(index - 1)}
      >
        {formatLabel(L.up)}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={locked || index >= count - 1}
        aria-label={formatLabel(L.moveDownNamed, { name })}
        onClick={() => onMove(index + 1)}
      >
        {formatLabel(L.down)}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={locked}
        aria-label={formatLabel(L.duplicateNamed, { name })}
        onClick={onDuplicate}
      >
        {formatLabel(L.duplicate)}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={locked}
        aria-label={formatLabel(L.removeNamed, { name })}
        onClick={onRemove}
      >
        {formatLabel(L.remove)}
      </Button>
    </div>
  );
}

/**
 * Removes a section; the only section of a band takes its band along (one undo step), because a band
 * cannot be empty.
 * @param editor Editor to change.
 * @param bandId Band holding the section.
 * @param sectionId Section to remove.
 * @returns The rejecting issues (empty = removed).
 * @example const issues = removeSectionOrBand(editor, 'main', 'centre');
 */
export function removeSectionOrBand(
  editor: HallEditor,
  bandId: string,
  sectionId: string,
): Issue[] {
  const band = editor.config.layout.bands.find((item) => item.id === bandId);
  if (band !== undefined && band.sections.length === 1) return editor.bands.remove(bandId);
  return editor.sections.remove({ bandId, sectionId });
}
