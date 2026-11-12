import { useState } from 'react';
import { builtInTemplates, type HallTemplate } from '@cinema-hall/core';
import type { EditorLabels } from '../../labels/editor-labels.js';
import { formatLabel } from '../../labels/labels.js';
import { useHallEditorContext } from '../context.js';

/**
 * Props of the template menu.
 */
export interface TemplateMenuProps {
  templates: readonly HallTemplate[];
  disabled: boolean;
  onPick: (template: HallTemplate) => void;
}

function libraryLabelKey(id: string): keyof EditorLabels | null {
  switch (id) {
    case 'threeSections':
      return 'templateThreeSections';
    case 'single':
      return 'templateSingle';
    case 'stadium':
      return 'templateStadium';
    default:
      return null;
  }
}

/**
 * The label of a template in the editor's language. Only the library's own templates are
 * translated; a host template keeps the label the host gave it.
 * @param template Template to name.
 * @param L Resolved constructor labels.
 * @returns The label in the editor language.
 */
export function templateLabel(template: HallTemplate, L: EditorLabels): string {
  // Ownership is provenance: only the objects of the built-in list belong to the library. A host
  // template with the same id or label is its own, and keeps the label its host gave it.
  const libraryOwned = builtInTemplates.includes(template);
  const key = libraryOwned ? libraryLabelKey(template.id) : null;
  return key !== null ? formatLabel(L[key]) : template.label;
}

/**
 * "Start from template": a button that opens a list of templates.
 * @param props Templates, disabled flag and the pick handler.
 * @param props.templates Templates offered by the template menu.
 * @param props.disabled Whether the menu is disabled.
 * @param props.onPick Called with the chosen template.
 * @returns The menu button and its list.
 * @example <TemplateMenu templates={builtInTemplates} onPick={apply} />
 */
export function TemplateMenu({ templates, disabled, onPick }: TemplateMenuProps) {
  const { options } = useHallEditorContext();
  const L = options.labels.editor;
  const { Button } = options.slots;
  const [open, setOpen] = useState(false);
  // A list that was open does not stay open once the constructor is read-only.
  const showing = open && !disabled;
  return (
    <div
      data-chk="editor-menu-wrap"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled}
        aria-label={formatLabel(L.templatesAria)}
        onClick={() => setOpen((value) => !value)}
      >
        {formatLabel(L.templates)}
      </Button>
      {showing ? (
        <div data-chk="editor-menu" role="group" aria-label={formatLabel(L.templatesAria)}>
          {templates.map((template) => (
            <Button
              type="button"
              key={template.id}
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                onPick(template);
              }}
            >
              {templateLabel(template, L)}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
