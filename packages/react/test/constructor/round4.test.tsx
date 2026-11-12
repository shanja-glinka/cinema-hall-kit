import { Suspense, startTransition, use, useLayoutEffect, useRef, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HallConfig, Issue, SaveResult } from '@cinema-hall/core';
import { HallConstructor } from '../../src/constructor/HallConstructor.js';
import { HallConstructorInspector } from '../../src/constructor/HallConstructorInspector.js';
import { HallConstructorRoot } from '../../src/constructor/HallConstructorRoot.js';
import {
  useHallEditorContext,
  type FocusControl,
  type HallEditorContextValue,
} from '../../src/constructor/context.js';
import { useFocusControl } from '../../src/constructor/ui/hooks.js';
import type { HallEditor } from '../../src/constructor/editor/types.js';
import { useHallEditor } from '../../src/constructor/editor/use-hall-editor.js';
import { describeIssue, fieldLabel } from '../../src/constructor/issues-view.js';
import { rebasePath } from '../../src/constructor/selection.js';
import { editorLabelsEn } from '../../src/labels/editor-labels.js';
import type { SaveContext } from '../../src/constructor/types.js';
import { fixtureText, loadFixture } from './support.js';

const previewProps = vi.fn();
vi.mock('../../src/seat-view/HallPreview.js', () => ({
  HallPreview: (props: unknown) => {
    previewProps(props);
    return <div data-testid="preview-3d" />;
  },
}));
vi.mock('../../src/seat-map/SeatMap.js', () => ({ SeatMap: () => null }));
afterEach(() => {
  cleanup();
  previewProps.mockClear();
});

const centre = () => screen.getByRole('button', { name: 'Section “Centre” · centre' });
function commit(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
  fireEvent.blur(element);
}

/** Renders a root with a probe that exposes the context and the editor. */
function renderRoot(extra?: { policy?: Parameters<typeof useHallEditor>[0]['policy'] }) {
  const sink: { ctx?: HallEditorContextValue } = {};
  function Probe() {
    sink.ctx = useHallEditorContext();
    return null;
  }
  function Host() {
    const editor = useHallEditor({ initial: loadFixture(), source: fixtureText, ...extra });
    return (
      <HallConstructorRoot editor={editor}>
        <Probe />
        <HallConstructorInspector />
      </HallConstructorRoot>
    );
  }
  render(<Host />);
  return () => {
    if (!sink.ctx) throw new Error('no context');
    return sink.ctx;
  };
}

describe('F11: the exclusion button carries its server error', () => {
  it('is aria-invalid and described by the message', async () => {
    const issue: Issue = {
      code: 'schema.excludeOutOfRange',
      severity: 'error',
      path: ['layout', 'bands', 0, 'sections', 1, 'exclude'],
      ref: { bandId: 'main', sectionId: 'centre' },
      params: { key: 'centre.r9.s9' },
    };
    render(
      <HallConstructor
        defaultValue={loadFixture()}
        onSave={async () => ({ ok: false, reason: 'invalid', issues: [issue] })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/server rejected/);
    fireEvent.click(centre());
    const button = screen.getByRole('button', { name: 'Remove seats' });
    expect(button.getAttribute('aria-invalid')).toBe('true');
    const message = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(message?.textContent).toMatch(/centre\.r9\.s9/);
  });
});

describe('F14: stable references rebase stale indices; seat types have anchors', () => {
  it('a stale section index with a section reference focuses the referenced field', async () => {
    const ctx = renderRoot();
    act(() =>
      ctx().focus.requestFocus(['layout', 'bands', 0, 'sections', 0, 'seatPitch'], {
        sectionId: 'centre',
      }),
    );
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-chk-path')).toBe(
        'layout.bands[0].sections[1].seatPitch',
      ),
    );
  });

  it('a seat type reference selects the catalogue and focuses that type', async () => {
    const ctx = renderRoot();
    act(() => ctx().focus.requestFocus([], { seatTypeId: 'standard' }));
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-chk-id')).toBe('seatType:standard'),
    );
  });
});

describe('F16 and F31: booked removed seats in 3D and in exclusion mode', () => {
  async function removeSeatInUse() {
    render(
      <HallConstructor
        defaultValue={loadFixture()}
        onSave={async () => ({ ok: false, reason: 'seats_in_use', keys: ['centre.r1.s8'] })}
      />,
    );
    fireEvent.click(centre());
    commit(screen.getByLabelText('Seats per row'), '7');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(document.querySelector('[data-key="centre.r1.s8"]')?.hasAttribute('data-ghost')).toBe(
        true,
      ),
    );
  }

  it('the 3D view receives the removed booked seat', async () => {
    await removeSeatInUse();
    fireEvent.click(screen.getByRole('button', { name: '3D' }));
    const layout = previewProps.mock.calls.at(-1)?.[0].layout as HallEditor['layout'];
    expect(layout.seats.some((seat) => seat.key === 'centre.r1.s8')).toBe(true);
  });

  it('a ghost dot never intercepts pointer hits', async () => {
    await removeSeatInUse();
    expect(
      document
        .querySelector('[data-key="centre.r1.s8"][data-ghost]')
        ?.getAttribute('pointer-events'),
    ).toBe('none');
  });
});

describe('F23: a child layout effect sees the committed policy', () => {
  it('a patch taken while the policy changes in the same commit is rejected', () => {
    const results: number[] = [];
    let seen: HallEditor | undefined;
    function Child({ editor, run }: { editor: HallEditor; run: boolean }) {
      useLayoutEffect(() => {
        if (run) results.push(editor.patch({ hall: { width: 20 } }).length);
      }, [run, editor]);
      return null;
    }
    function Host({ locked, run }: { locked: boolean; run: boolean }) {
      const editor = useHallEditor({
        initial: loadFixture(),
        policy: locked ? { 'hall.width': 'locked' } : undefined,
      });
      seen = editor;
      return <Child editor={editor} run={run} />;
    }
    const view = render(<Host locked={false} run={false} />);
    view.rerender(<Host locked run />);
    expect(results[0]).toBeGreaterThan(0);
    expect(seen?.config.hall.width).toBe(loadFixture().hall.width);
  });
});

describe('F27 and F29: save sessions', () => {
  function renderHost(onSave: (config: HallConfig, ctx: SaveContext) => Promise<SaveResult>) {
    const sink: { editor?: HallEditor; save?: () => Promise<void> } = {};
    function Probe() {
      sink.save = useHallEditorContext().save.save;
      return null;
    }
    function Host() {
      const editor = useHallEditor({ initial: loadFixture(), source: fixtureText, revision: 1 });
      sink.editor = editor;
      return (
        <HallConstructorRoot editor={editor} onSave={onSave}>
          <Probe />
        </HallConstructorRoot>
      );
    }
    render(<Host />);
    return sink;
  }

  it('an answer that arrives after markSaved with another revision does not roll it back', async () => {
    let resolveSave: (result: SaveResult) => void = () => undefined;
    const sink = renderHost(
      () =>
        new Promise<SaveResult>((resolve) => {
          resolveSave = resolve;
        }),
    );
    act(() => {
      sink.editor?.patch({ hall: { depth: 17 } });
    });
    let pending: Promise<void> | undefined;
    act(() => {
      pending = sink.save?.();
    });
    act(() => {
      sink.editor?.markSaved(undefined, { revision: 3 });
    });
    await act(async () => {
      resolveSave({ ok: true, revision: 2 });
      await pending;
    });
    expect(sink.editor?.revision).toBe(3);
  });

  it('a save started before React commits a reset sends the reset hall, YAML and revision', async () => {
    const onSave = vi.fn(async (_c: HallConfig, _x: SaveContext): Promise<SaveResult> => ({
      ok: true,
    }));
    const sink = renderHost(onSave);
    const fresh = loadFixture();
    const renamed: HallConfig = { ...fresh, name: 'NewHall' };
    await act(async () => {
      sink.editor?.reset(renamed, { source: 'name: NewHall\n', revision: 2 });
      await sink.save?.();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    const [config, ctx] = onSave.mock.calls[0] ?? [];
    expect(config?.name).toBe('NewHall');
    expect(ctx?.revision).toBe(2);
    expect(ctx?.yaml).toContain('NewHall');
  });
});

describe('F28 and F32: adding objects never throws and respects the editor constraints', () => {
  it('adding to a band whose sections hold explicit geometry copies the neighbour', () => {
    const config = loadFixture();
    const band = config.layout.bands[0]!;
    const explicit = band.sections.map((s) => ({
      ...s,
      rows: 7,
      rowSpacing: 0.95,
      seatPitch: 0.6,
      seatType: 'standard',
    }));
    config.layout.bands[0] = { ...band, defaults: undefined, sections: explicit } as typeof band;
    const sink: { editor?: HallEditor } = {};
    function Host() {
      sink.editor = useHallEditor({ initial: config });
      return null;
    }
    render(<Host />);
    let issues: Issue[] = [];
    act(() => {
      issues = sink.editor!.sections.add('main');
    });
    expect(issues).toEqual([]);
    let missing: Issue[] = [];
    act(() => {
      missing = sink.editor!.sections.add('main', { seatType: 'missing' });
    });
    expect(missing.length).toBeGreaterThan(0);
  });

  it('a new band is fitted against the constraints the editor was given', () => {
    const config = loadFixture();
    config.hall.depth = 18;
    const sink: { editor?: HallEditor } = {};
    function Host() {
      sink.editor = useHallEditor({ initial: config, constraints: { minRearClearance: 3 } });
      return null;
    }
    render(<Host />);
    expect(sink.editor!.issues.some((i) => i.code === 'fit.depth')).toBe(false);
    act(() => void sink.editor!.bands.add());
    expect(sink.editor!.config.layout.bands).toHaveLength(3);
    expect(sink.editor!.issues.some((i) => i.code === 'fit.depth')).toBe(false);
    const strictRows = sink.editor!.config.layout.bands.at(-1)?.defaults?.rows ?? 0;

    cleanup();
    function Lenient() {
      sink.editor = useHallEditor({ initial: config });
      return null;
    }
    render(<Lenient />);
    act(() => void sink.editor!.bands.add());
    const lenientRows = sink.editor!.config.layout.bands.at(-1)?.defaults?.rows ?? 0;
    expect(strictRows).toBeLessThan(lenientRows);
  });
});

describe('F30: rejected keyboard undo and template are visible', () => {
  it('Ctrl+Z refused by a locked field shows a notice', () => {
    const sink: { editor?: HallEditor } = {};
    function Host({ locked }: { locked: boolean }) {
      const editor = useHallEditor({
        initial: loadFixture(),
        policy: locked ? { 'hall.width': 'locked' } : undefined,
      });
      sink.editor = editor;
      return (
        <HallConstructorRoot editor={editor}>
          <HallConstructorInspector />
        </HallConstructorRoot>
      );
    }
    const view = render(<Host locked={false} />);
    act(() => void sink.editor!.patch({ hall: { width: 15 } }));
    view.rerender(<Host locked />);
    fireEvent.keyDown(document.querySelector('[data-chk="editor"]')!, { key: 'z', ctrlKey: true });
    expect(screen.getByRole('alert')).toBeDefined();
    expect(sink.editor!.config.hall.width).toBe(15);
  });

  it('a rejected template is shown even after a failed save', async () => {
    render(
      <HallConstructor
        defaultValue={loadFixture()}
        policy={{ 'hall.width': 'locked' }}
        onSave={async () => {
          throw new Error('offline');
        }}
        templates={[
          {
            id: 't',
            label: 'Wide',
            create: () => ({ ...loadFixture(), hall: { ...loadFixture().hall, width: 30 } }),
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Save failed: offline');
    fireEvent.click(screen.getByRole('button', { name: /template/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Wide' }));
    expect(screen.getByRole('alert').textContent).toMatch(/locked|Rejected|rejected/i);
  });
});

describe('F33: a price draft belongs to its tier', () => {
  it('selecting another tier shows that tier’s value', () => {
    const config = loadFixture();
    config.pricing = { tiers: { standard: 450, recliner: 650 } };
    render(<HallConstructor defaultValue={config} />);
    fireEvent.click(centre());
    commit(screen.getByLabelText('Seat price'), '999.999');
    expect(screen.getByLabelText('Seat price').getAttribute('aria-invalid')).toBe('true');
    fireEvent.click(document.querySelector('[data-section="rec-centre"]')!);
    expect((screen.getByLabelText('Seat price') as HTMLInputElement).value).toBe('650');
  });
});

describe('F34: Hall and Screen show keyboard focus', () => {
  it('the stylesheet styles their focus-visible state', () => {
    const css = readFileSync('src/constructor/constructor.css', 'utf8');
    expect(css).toMatch(/editor-hall-object'\]:focus-visible/);
    expect(css).toMatch(/editor-screen-object'\]:focus-visible/);
  });
});

describe('F35: new controls follow slots and labels', () => {
  it('the notice dismiss control is the Button slot and the view buttons use labels', () => {
    const Slot = (props: {
      onClick?: () => void;
      children: React.ReactNode;
      'aria-label'?: string;
    }) => (
      <button data-testid="slot-button" aria-label={props['aria-label']} onClick={props.onClick}>
        {props.children}
      </button>
    );
    render(
      <HallConstructor
        defaultValue={loadFixture()}
        slots={{ Button: Slot }}
        labels={{ editor: { view3d: 'Volume', viewMap: 'Plan' } }}
      />,
    );
    expect(screen.getByText('Volume')).toBeDefined();
    expect(screen.getByText('Plan')).toBeDefined();
  });

  it('the dismiss button is rendered by the slot', () => {
    const Slot = (props: {
      onClick?: () => void;
      children: React.ReactNode;
      'aria-label'?: string;
    }) => (
      <button data-slot="yes" aria-label={props['aria-label']} onClick={props.onClick}>
        {props.children}
      </button>
    );
    const config = loadFixture();
    config.layout.bands = [
      { ...config.layout.bands[1]!, sections: [config.layout.bands[1]!.sections[0]!] },
    ];
    render(<HallConstructor defaultValue={config} slots={{ Button: Slot }} />);
    fireEvent.click(document.querySelector('[data-chk="editor-section-object"]')!);
    fireEvent.click(screen.getByRole('button', { name: 'Remove band' }));
    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('button', { name: 'Dismiss' }).getAttribute('data-slot')).toBe(
      'yes',
    );
  });
});

describe('F37: every editable field is named in its messages', () => {
  it.each([
    [['screen', 'elevation'], 'Bottom edge'],
    [['screen', 'curvature'], 'curvature'],
    [['hall', 'wallColor'], 'Wall'],
    [['layout', 'eyeHeight'], 'Eye'],
    [['constraints', 'minAisleWidth'], 'aisle'],
    [['seatTypes', 'standard', 'width'], 'width'],
    [['pricing', 'tiers', 'standard'], 'price'],
    [['viewingZones', 0, 'minFov'], 'view'],
    [['layout', 'bands', 0, 'defaults', 'rows'], 'Rows'],
  ])('%j has a field label', (path, fragment) => {
    const label = fieldLabel(path, editorLabelsEn);
    expect(label?.toLowerCase()).toContain(String(fragment).toLowerCase());
  });

  it('a rejected negative elevation names the field', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Screen' }));
    const input = document.querySelector<HTMLInputElement>('[data-chk-path="screen.elevation"]')!;
    commit(input, '-1');
    expect(screen.getByText(/^Bottom edge[^:]*: /i)).toBeDefined();
  });
});

describe('F39: the save controller gates on server errors too', () => {
  it('blocked is true after a server validation error on the unchanged hall', async () => {
    const sink: { blocked?: boolean; save?: () => Promise<void> } = {};
    function Probe() {
      const controller = useHallEditorContext().save;
      sink.blocked = controller.blocked;
      sink.save = controller.save;
      return null;
    }
    function Host() {
      const editor = useHallEditor({ initial: loadFixture() });
      return (
        <HallConstructorRoot
          editor={editor}
          onSave={async () => ({
            ok: false,
            reason: 'invalid',
            issues: [{ code: 'schema.tooSmall', severity: 'error', path: ['hall', 'depth'] }],
          })}
        >
          <Probe />
          <HallConstructorInspector />
        </HallConstructorRoot>
      );
    }
    render(<Host />);
    expect(sink.blocked).toBe(false);
    await act(async () => {
      await sink.save?.();
    });
    expect(sink.blocked).toBe(true);
  });
});

describe('F40: the issue badge title is one string', () => {
  it('server rendering produces no empty titles', () => {
    const config = loadFixture();
    const html = renderToString(<HallConstructor defaultValue={config} />);
    expect(html).not.toContain('<title></title>');
  });
});

describe('F41: the focus request handler is not changed by an abandoned render', () => {
  it('a transition render that suspends and is discarded leaves the committed handler', async () => {
    const calls: string[] = [];
    const never = new Promise<void>(() => undefined);
    let control: FocusControl | undefined;
    let update: (next: { tag: string; suspend: boolean }) => void = () => undefined;
    function Suspender({ suspend }: { suspend: boolean }) {
      if (suspend) use(never);
      return null;
    }
    function Host() {
      const [state, setState] = useState({ tag: 'A', suspend: false });
      update = setState;
      const rootRef = useRef<HTMLDivElement>(null);
      control = useFocusControl(rootRef, undefined, (path) => {
        calls.push(state.tag);
        return path;
      });
      return (
        <div ref={rootRef}>
          <Suspense fallback={null}>
            <Suspender suspend={state.suspend} />
          </Suspense>
        </div>
      );
    }
    render(<Host />);
    await act(async () => {
      startTransition(() => update({ tag: 'B', suspend: true }));
    });
    // Resolved against the committed handler, not the discarded transition render's.
    await act(async () => {
      control?.requestFocus([]);
    });
    expect(calls[0]).toBe('A');
  });
});

describe('round 5', () => {
  it('F42: runtime paths that name inherited members fall back to no field label', () => {
    for (const locale of ['en-US', 'de-DE']) {
      for (const path of [
        ['constructor'],
        ['toString'],
        ['constraints', 'constructor'],
        ['layout', 'bands', 0, 'defaults', 'toString'],
      ]) {
        const issue: Issue = { severity: 'error', code: 'schema.invalidValue', path };
        expect(() => describeIssue(issue, editorLabelsEn, locale)).not.toThrow();
        expect(fieldLabel(path, editorLabelsEn)).toBeNull();
      }
    }
  });

  it('F44: a failure while reading or serializing the state is reported, and the edit is kept', async () => {
    const sink: { save?: () => Promise<void>; status?: string | null; message?: string | null } =
      {};
    function Probe() {
      const save = useHallEditorContext().save;
      sink.save = save.save;
      sink.status = save.status;
      sink.message = save.message;
      return null;
    }
    function Host() {
      const editor = useHallEditor({
        initial: loadFixture(),
        // A broken external source makes the YAML export throw.
        source: null as unknown as string,
      });
      return (
        <HallConstructorRoot editor={editor} onSave={async () => ({ ok: true })}>
          <Probe />
        </HallConstructorRoot>
      );
    }
    render(<Host />);
    await act(async () => {
      await expect(sink.save?.()).resolves.toBeUndefined();
    });
    expect(sink.status).toBe('error');
    expect(sink.message).toBeTruthy();
  });

  it('F45: a null reference at runtime keeps the index path', () => {
    const config = loadFixture();
    const path = ['layout', 'bands', 0, 'sections', 1, 'seatPitch'];
    expect(rebasePath(config, path, null as unknown as undefined)).toEqual(path);
  });

  it('F14: a move and a focus request in one event land on the field at its new index', async () => {
    const ctx = renderRoot();
    act(() => {
      ctx().editor.sections.move({ bandId: 'main', sectionId: 'centre' }, 0);
      ctx().focus.requestFocus(['layout', 'bands', 0, 'sections', 1, 'seatPitch'], {
        bandId: 'main',
        sectionId: 'centre',
      });
    });
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-chk-path')).toBe(
        'layout.bands[0].sections[0].seatPitch',
      ),
    );
  });

  it('F16: the 3D room grows to hold a removed booked seat outside the edited room', async () => {
    const config = loadFixture();
    render(
      <HallConstructor
        defaultValue={config}
        onSave={async () => ({ ok: false, reason: 'seats_in_use', keys: ['rec-right.r2.s3'] })}
      />,
    );
    const hall = screen.getByRole('button', { name: 'Hall' });
    fireEvent.click(hall);
    const depth = document.querySelector<HTMLInputElement>('[data-chk-path="hall.depth"]')!;
    // Remove the recliner band first, then shrink the room to end before its old seats.
    fireEvent.click(document.querySelector('[data-section="rec-right"]')!);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    fireEvent.click(document.querySelector('[data-section="rec-centre"]')!);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    fireEvent.click(document.querySelector('[data-section="rec-left"]')!);
    fireEvent.click(screen.getByRole('button', { name: 'Remove band' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hall' }));
    commit(document.querySelector<HTMLInputElement>('[data-chk-path="hall.depth"]') ?? depth, '12');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/Booked seats/);
    fireEvent.click(screen.getByRole('button', { name: '3D' }));
    const layout = previewProps.mock.calls.at(-1)?.[0].layout as HallEditor['layout'];
    const seat = layout.seats.find((s) => s.key === 'rec-right.r2.s3');
    expect(seat).toBeDefined();
    expect(layout.hall.depth).toBeGreaterThanOrEqual(seat!.position.z + 0.4);
  });

  it('F37: band and section id fields are named in rejections', () => {
    expect(fieldLabel(['layout', 'bands', 0, 'id'], editorLabelsEn)).toBe(editorLabelsEn.sectionId);
    expect(fieldLabel(['layout', 'bands', 0, 'sections', 1, 'id'], editorLabelsEn)).toBe(
      editorLabelsEn.sectionId,
    );
    const sink: { editor?: HallEditor } = {};
    function Host() {
      sink.editor = useHallEditor({ initial: loadFixture() });
      return null;
    }
    render(<Host />);
    const issues = sink.editor!.sections.patch({ bandId: 'main', sectionId: 'centre' }, { id: '' });
    expect(issues.length).toBeGreaterThan(0);
    expect(describeIssue(issues[0]!, editorLabelsEn, 'en')).toContain(
      `${editorLabelsEn.sectionId}:`,
    );
  });

  it('F43: the toolbar root takes classNames.editorToolbar', () => {
    render(
      <HallConstructor
        defaultValue={loadFixture()}
        classNames={{ editorToolbar: 'host-toolbar' }}
      />,
    );
    const toolbar = document.querySelector('[data-chk="editor-toolbar"]')!;
    expect(toolbar.classList.contains('host-toolbar')).toBe(true);
    expect(toolbar.classList.contains('chk-glass')).toBe(true);
  });
});

describe('round 6', () => {
  it('F44: a serialization failure stays visible after an edit made in the same event commits', async () => {
    const sink: {
      editor?: HallEditor;
      save?: () => Promise<void>;
      status?: string | null;
      message?: string | null;
    } = {};
    function Probe() {
      const save = useHallEditorContext().save;
      sink.save = save.save;
      sink.status = save.status;
      sink.message = save.message;
      return null;
    }
    function Host() {
      const editor = useHallEditor({ initial: loadFixture(), source: null as unknown as string });
      sink.editor = editor;
      return (
        <HallConstructorRoot editor={editor} onSave={async () => ({ ok: true })}>
          <Probe />
        </HallConstructorRoot>
      );
    }
    render(<Host />);
    await act(async () => {
      sink.editor?.patch({ name: 'Renamed' });
      await sink.save?.();
    });
    expect(sink.editor?.config.name).toBe('Renamed');
    expect(sink.status).toBe('error');
    expect(sink.message).toBeTruthy();
    expect(sink.editor?.dirty).toBe(true);
  });

  it('F16: the feedback room is tall enough for a removed booked seat on a high riser', async () => {
    const config = loadFixture();
    config.hall.height = 3;
    config.screen = { ...config.screen, height: 1.5, elevation: 0.5 };
    config.layout.bands[1] = { ...config.layout.bands[1]!, riserHeight: 1 };
    render(
      <HallConstructor
        defaultValue={config}
        onSave={async () => ({ ok: false, reason: 'seats_in_use', keys: ['rec-right.r2.s3'] })}
      />,
    );
    fireEvent.click(document.querySelector('[data-section="rec-right"]')!);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    fireEvent.click(document.querySelector('[data-section="rec-centre"]')!);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    fireEvent.click(document.querySelector('[data-section="rec-left"]')!);
    fireEvent.click(screen.getByRole('button', { name: 'Remove band' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/Booked seats/);
    fireEvent.click(screen.getByRole('button', { name: '3D' }));
    const layout = previewProps.mock.calls.at(-1)?.[0].layout as HallEditor['layout'];
    const seat = layout.seats.find((s) => s.key === 'rec-right.r2.s3');
    expect(seat).toBeDefined();
    expect(layout.hall.height).toBeGreaterThanOrEqual(seat!.position.y + 1.4 + 0.5);
  });
});

describe('band labels are never clipped', () => {
  it('the view box reaches left of the longest band label', () => {
    const config = loadFixture();
    // 64 wide glyphs: the widest id the schema allows.
    config.layout.bands[0] = { ...config.layout.bands[0]!, id: 'W'.repeat(64) };
    render(<HallConstructor defaultValue={config} />);
    const svg = document.querySelector('[data-chk="editor-plan"]')!;
    const [x] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const labels = [...document.querySelectorAll('[data-chk="editor-band-object"] text')];
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      const end = Number(label.getAttribute('x'));
      // Independent bound: a wide glyph ('W') is ≈ 0.94 em; one full em (0.42 m) per character covers any font.
      expect(x!).toBeLessThanOrEqual(end - (label.textContent ?? '').length * 0.42);
    }
  });
});

describe('band labels follow their rendered width (DEMO-06)', () => {
  it('grows the label column to the measured width of a wide bold label', () => {
    // A heavy host font: the label renders 40 m wide, far beyond any per-glyph estimate.
    const getBBox = vi.fn(function (this: SVGElement) {
      return {
        x: 0,
        y: 0,
        width: this.getAttribute('data-chk') === 'editor-band-label' ? 40 : 0,
        height: 0.4,
      } as DOMRect;
    });
    Object.defineProperty(SVGElement.prototype, 'getBBox', { configurable: true, value: getBBox });
    try {
      const config = loadFixture();
      config.layout.bands[0] = { ...config.layout.bands[0]!, id: 'W'.repeat(64) };
      render(<HallConstructor defaultValue={config} />);
      const svg = document.querySelector('[data-chk="editor-plan"]')!;
      const [x] = svg.getAttribute('viewBox')!.split(' ').map(Number);
      const label = document.querySelector('[data-chk="editor-band-label"]')!;
      expect(x!).toBeLessThanOrEqual(Number(label.getAttribute('x')) - 40);
    } finally {
      delete (SVGElement.prototype as { getBBox?: unknown }).getBBox;
    }
  });
});

describe('band label measurement lifecycle (DEMO-06, round 3)', () => {
  let width = 40;
  beforeEach(() => {
    width = 40;
    Object.defineProperty(SVGElement.prototype, 'getBBox', {
      configurable: true,
      value(this: SVGElement) {
        const w = this.getAttribute('data-chk') === 'editor-band-label' ? width : 0;
        return { x: 0, y: 0, width: w, height: 0.4 } as DOMRect;
      },
    });
  });
  afterEach(() => {
    delete (SVGElement.prototype as { getBBox?: unknown }).getBBox;
  });
  const leftEdge = () =>
    Number(
      document.querySelector('[data-chk="editor-plan"]')!.getAttribute('viewBox')!.split(' ')[0],
    );
  const labelEnd = () =>
    Number(document.querySelector('[data-chk="editor-band-label"]')!.getAttribute('x'));

  it('keeps the measurement through a 3D edit and measures again back in 2D', () => {
    render(<HallConstructor defaultValue={loadFixture()} />);
    expect(leftEdge()).toBeLessThanOrEqual(labelEnd() - 40);
    fireEvent.click(screen.getByRole('button', { name: '3D' }));
    width = 50; // a band rename changes the label while the plan is not shown
    fireEvent.click(screen.getByRole('button', { name: /map|2D|plan/i }));
    expect(leftEdge()).toBeLessThanOrEqual(labelEnd() - 50);
  });

  it('measures again when web fonts finish loading', () => {
    const listeners: Array<() => void> = [];
    const fonts = {
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
      removeEventListener: () => undefined,
    };
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
    try {
      render(<HallConstructor defaultValue={loadFixture()} />);
      expect(leftEdge()).toBeLessThanOrEqual(labelEnd() - 40);
      width = 60;
      act(() => listeners.forEach((fn) => fn()));
      expect(leftEdge()).toBeLessThanOrEqual(labelEnd() - 60);
    } finally {
      delete (document as { fonts?: unknown }).fonts;
    }
  });
});
