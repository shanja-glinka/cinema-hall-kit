import { fieldKeyForPath, type Issue } from '@cinema-hall/core';
import { useHallEditorContext } from '../context.js';
import { issueFix, issueFixLabel } from '../issues-view.js';
import { useActionRunner } from '../form/shared.js';
import { editorConstraints } from '../editor/use-hall-editor.js';

/**
 * The one-click fix of an issue, when it has one: "Make the hall 16.25 m deep" for seats that go past
 * the back wall, "Make the hall 15 m wide" for a band wider than the hall. Not shown when the
 * constructor is read-only or the policy locks or hides that hall size.
 * @param props The issue to fix.
 * @param props.issue Issue from client or server validation.
 * @returns The fix button, or nothing.
 * @example <IssueFixButton issue={issue} />
 */
export function IssueFixButton({ issue }: { issue: Issue }) {
  const { editor, options, readOnly } = useHallEditorContext();
  const { run } = useActionRunner();
  const fix = issueFix(issue, { config: editor.config, constraints: editorConstraints(editor) });
  if (fix === null || readOnly) return null;
  const key = fieldKeyForPath(['hall', fix.dimension]);
  if (key !== null && (editor.policy[key] ?? 'editable') !== 'editable') return null;
  if (editor.config.hall[fix.dimension] >= fix.value) return null;
  const { Button } = options.slots;
  return (
    <span data-chk="editor-fix">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => run(editor.patch({ hall: { [fix.dimension]: fix.value } }))}
      >
        {issueFixLabel(fix, options.labels.editor, options.locale)}
      </Button>
    </span>
  );
}
