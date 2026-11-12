import type { ReactNode, FormEvent } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { builtInTemplates, type HallTemplate, type Issue } from '@cinema-hall/core';
import { HallConstructor } from '../../src/constructor/HallConstructor.js';
import { sectionIdsWithErrors } from '../../src/constructor/issues-view.js';
import { templateLabel } from '../../src/constructor/toolbar/TemplateMenu.js';
import { editorLabelsEn } from '../../src/labels/editor-labels.js';
import { fixtureText, loadFixture } from './support.js';

vi.mock('../../src/seat-view/HallPreview.js', () => ({ HallPreview: () => null }));
vi.mock('../../src/seat-map/SeatMap.js', () => ({ SeatMap: () => null }));

/** A slot whose buttons submit a form unless the constructor says otherwise. */
function SubmitByDefault(props: {
  type?: 'button' | 'submit';
  variant?: string;
  size?: string;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  'aria-label'?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type={props.type ?? 'submit'}
      disabled={props.disabled}
      aria-label={props['aria-label']}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

afterEach(() => {
  cleanup();
});

describe('F15: the import dialog is a modal', () => {
  it('focus starts in the dialog, stays in it, and returns to Import on Escape', () => {
    render(<HallConstructor defaultValue={loadFixture()} source={fixtureText} />);
    const importButton = screen.getByRole('button', { name: 'Import' });
    importButton.focus();
    fireEvent.click(importButton);
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    const toolsOutside = document.querySelector('[data-chk="editor-toolbar-tools"]');
    expect(toolsOutside?.hasAttribute('inert')).toBe(true);

    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    cancel.focus();
    fireEvent.keyDown(cancel, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(within(dialog).getByLabelText('Choose file'));

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(importButton);
    expect(toolsOutside?.hasAttribute('inert')).toBe(false);
  });
});

describe('F17: a band error highlights its sections', () => {
  it('an error that names only a band covers all of its sections', () => {
    const issues: Issue[] = [
      { severity: 'error', code: 'fit.width', path: ['hall', 'width'], ref: { bandId: 'main' } },
    ];
    const ids = sectionIdsWithErrors(issues, loadFixture().layout.bands);
    expect(ids).toEqual(expect.arrayContaining(['left', 'centre', 'right']));
    expect(ids).not.toContain('rec-left');
  });
});

describe('F18: library template names follow the locale', () => {
  it('a library template is named in the editor language; a host template keeps its label', () => {
    const three = builtInTemplates.find((template) => template.id === 'threeSections');
    if (!three) throw new Error('the built-in template is missing');
    expect(templateLabel(three, editorLabelsEn)).toBe('Three sections (concept)');
    expect(templateLabel(three, editorLabelsEn)).toBe('Three sections (concept)');
    const host: HallTemplate = { id: 'single', label: 'My Hall', create: loadFixture };
    expect(templateLabel(host, editorLabelsEn)).toBe('My Hall');
  });
});

describe('F21: a file read does not overwrite a newer selection or typed text', () => {
  function pendingFile(): { file: File; resolve: (text: string) => void } {
    let resolve: (text: string) => void = () => undefined;
    const promise = new Promise<string>((done) => {
      resolve = done;
    });
    return { file: { text: () => promise } as unknown as File, resolve };
  }

  it('the older file read is dropped when a newer file was chosen after it', async () => {
    render(<HallConstructor defaultValue={loadFixture()} source={fixtureText} />);
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    const input = screen.getByLabelText('Choose file');
    const first = pendingFile();
    const second = pendingFile();
    fireEvent.change(input, { target: { files: [first.file] } });
    fireEvent.change(input, { target: { files: [second.file] } });
    await act(async () => {
      second.resolve('second');
    });
    await act(async () => {
      first.resolve('first');
    });
    expect(
      (screen.getByRole('textbox', { name: 'Import YAML or JSON' }) as HTMLTextAreaElement).value,
    ).toBe('second');
  });

  it('a file read that finishes after the user typed does not replace the typed text', async () => {
    render(<HallConstructor defaultValue={loadFixture()} source={fixtureText} />);
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    const pending = pendingFile();
    fireEvent.change(screen.getByLabelText('Choose file'), { target: { files: [pending.file] } });
    const textarea = screen.getByRole('textbox', { name: 'Import YAML or JSON' });
    fireEvent.change(textarea, { target: { value: 'mine' } });
    await act(async () => {
      pending.resolve('from the file');
    });
    expect((textarea as HTMLTextAreaElement).value).toBe('mine');
  });
});

describe('F22: constructor actions never submit a host form', () => {
  it('Add band does not submit a form around the constructor', () => {
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <HallConstructor defaultValue={loadFixture()} slots={{ Button: SubmitByDefault }} />
      </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Row of sections' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('F26: only the built-in templates are the library templates', () => {
  it('a host template with a library id and label keeps the label its host gave it', () => {
    const host: HallTemplate = { id: 'single', label: 'Single block', create: loadFixture };
    expect(templateLabel(host, editorLabelsEn)).toBe('Single block');
  });

  it('a built-in template is still named in the editor language', () => {
    const single = builtInTemplates.find((template) => template.id === 'single');
    if (!single) throw new Error('the built-in template is missing');
    expect(templateLabel(single, editorLabelsEn)).toBe('Single block');
  });
});
