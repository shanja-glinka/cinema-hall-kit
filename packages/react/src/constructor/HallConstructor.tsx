import { builtInTemplates, type HallTemplate } from '@cinema-hall/core';
import type { HallEditor } from './editor/types.js';
import { useHallEditor } from './editor/use-hall-editor.js';
import { HallConstructorInspector } from './HallConstructorInspector.js';
import { HallConstructorCanvas } from './HallConstructorCanvas.js';
import { HallConstructorRoot } from './HallConstructorRoot.js';
import type {
  HallConstructorCommonProps,
  HallConstructorOwnProps,
  HallConstructorProps,
} from './types.js';
import { HallConstructorToolbar } from './toolbar/HallConstructorToolbar.js';

type ShellProps = HallConstructorCommonProps & {
  editor: HallEditor;
  templates?: readonly HallTemplate[];
};

/** The plan and a single, contextual inspector. */
function ConstructorBody() {
  return (
    <div data-chk="editor-body">
      <HallConstructorCanvas />
      <HallConstructorInspector />
    </div>
  );
}

function HallConstructorShell({ editor, templates, ...rest }: ShellProps) {
  return (
    <HallConstructorRoot editor={editor} {...rest}>
      <HallConstructorToolbar templates={templates ?? builtInTemplates} />
      <ConstructorBody />
    </HallConstructorRoot>
  );
}

function OwnEditorConstructor({
  defaultValue,
  source,
  policy,
  revision,
  extraRules,
  constraints,
  severity,
  templates,
  ...rest
}: HallConstructorOwnProps & { templates?: readonly HallTemplate[] }) {
  const editor = useHallEditor({
    initial: defaultValue,
    source,
    policy,
    revision,
    extraRules,
    constraints,
    severity,
  });
  return <HallConstructorShell {...rest} editor={editor} templates={templates} />;
}

/**
 * The hall constructor: an editable plan, a contextual inspector, the toolbar and the save
 * flow. Pass `editor` from `useHallEditor`, or `defaultValue` to let the component create one.
 * @param props An editor or initial config, with host options and a save handler.
 * @returns The complete constructor UI.
 * @example <HallConstructor defaultValue={config} locale="en-US" onSave={saveHall} />
 */
export function HallConstructor(props: HallConstructorProps) {
  if (props.editor !== undefined) {
    return <HallConstructorShell {...props} editor={props.editor} />;
  }
  return <OwnEditorConstructor {...props} />;
}
