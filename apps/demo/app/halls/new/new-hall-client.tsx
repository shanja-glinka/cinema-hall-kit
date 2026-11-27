'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useMemo, useState, type ChangeEvent, type DragEvent } from 'react';
import { buildHallLayout, formatPrice } from '@cinema-hall/core';
import { HallThumb } from '@/app/_components/hall-thumb';
import { LOCALE, t } from '@/lib/shared/texts';
import { IssueList } from '@/app/_components/issue-list';
import { ShowtimeFields, useShowtimeForm } from '@/app/_components/showtime-form';
import { checkHallText, tiersOf } from '@/lib/shared/hall-check';
import { deriveHallId } from '@/lib/shared/hall-id';
import { isCreateHallResponse, type CreateHallBody, type IssueView } from '@/lib/shared/types';
import './new-hall.css';

const MAX_FILE_BYTES = 256 * 1024;

interface NewHallClientProps {
  exampleYaml: string;
  /** The name written in the example, for the note after loading it. */
  exampleName: string;
  /** The server's today, `YYYY-MM-DD`. */
  today: string;
  /** Ids of the halls that exist, to say in advance which id a new hall gets. */
  takenIds: readonly string[];
}

interface ServerFailure {
  message: string;
  issues: IssueView[];
}

/**
 * Upload a hall: file, drop or paste, an instant check in the browser (`parseHallConfig` and
 * `validateHall`), a plan of the hall and a session generator. "Create hall" sends the text to the
 * backend, which validates it again and creates the hall and its sessions.
 * @param props The example text and the server's date.
 * @returns The page.
 */
export function NewHallClient({ exampleYaml, exampleName, today, takenIds }: NewHallClientProps) {
  const texts = t.importPage;
  const router = useRouter();
  const [text, setText] = useState('');
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [cinema, setCinema] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ServerFailure | null>(null);

  // The check parses up to 256 KiB per change; the deferred value keeps typing responsive.
  const deferredText = useDeferredValue(text);
  const check = useMemo(() => checkHallText(deferredText), [deferredText]);
  const hall = useMemo(() => {
    if (!check.ok) return null;
    const layout = buildHallLayout(check.config);
    return { config: check.config, layout, tiers: tiersOf(layout) };
  }, [check]);

  const form = useShowtimeForm(today, hall?.tiers ?? null);
  const { generator, plan } = form;
  // Which id the hall gets: the file's own id unless another hall has it, then one from its name.
  const idNote = useMemo(() => {
    if (!hall?.config.id) return null;
    const taken = new Set(takenIds);
    if (!taken.has(hall.config.id)) return null;
    return { requested: hall.config.id, id: deriveHallId(hall.config, taken) };
  }, [hall, takenIds]);

  const empty = text.trim() === '';
  const stale = text !== deferredText;
  const planError = plan && !plan.ok ? plan : null;
  const canCreate = hall !== null && !stale && !submitting && planError === null;

  const loadFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setFailure(null);
    if (file.size > MAX_FILE_BYTES) {
      setFileNote(texts.tooLarge(file.name));
      return;
    }
    const content = await file.text();
    if (content.includes('\u0000')) {
      setFileNote(texts.notText(file.name));
      return;
    }
    setFileNote(texts.loaded(file.name));
    setText(content);
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    void loadFile(event.target.files?.[0]);
    // The same file can then be chosen again after an edit.
    event.target.value = '';
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    void loadFile(event.dataTransfer.files[0]);
  };

  const submit = async (): Promise<void> => {
    if (!hall) return;
    setSubmitting(true);
    setFailure(null);
    const body: CreateHallBody = {
      yaml: text,
      ...(cinema.trim() ? { cinema: cinema.trim() } : {}),
      ...(generator ? { generator } : {}),
    };
    try {
      const response = await fetch('/api/halls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result: unknown = await response.json();
      if (!isCreateHallResponse(result)) throw new Error(`POST /api/halls: ${response.status}`);
      if (result.ok) {
        const requested = result.requestedId
          ? `&requested=${encodeURIComponent(result.requestedId)}`
          : '';
        router.push(`/?new=${encodeURIComponent(result.hall.id)}${requested}`);
        return;
      }
      setFailure({ message: result.message, issues: result.issues ?? [] });
    } catch {
      setFailure({ message: t.common.networkError, issues: [] });
    }
    setSubmitting(false);
  };

  return (
    <main className="new-hall">
      <header className="page-head">
        <p>
          <Link href="/">{t.common.allHalls}</Link>
        </p>
        <h1>{texts.title}</h1>
        <p className="muted">{texts.lede}</p>
      </header>

      <div className="new-hall-grid">
        <section className="panel" aria-labelledby="source-title">
          <h2 id="source-title">{texts.fileTitle}</h2>
          <label
            className="dropzone"
            data-dragging={dragging ? '' : undefined}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              type="file"
              accept=".yaml,.yml,.json,text/yaml,application/json"
              onChange={onFile}
              aria-label={texts.fileInput}
            />
            <strong>{texts.drop}</strong>
            <span className="muted">{texts.dropHint}</span>
          </label>
          <p className="muted">{texts.sizeNote}</p>
          {fileNote ? (
            <p className="muted" role="status">
              {fileNote}
            </p>
          ) : null}

          <label className="field">
            <span>{texts.paste}</span>
            <textarea
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setFailure(null);
              }}
              rows={14}
              spellCheck={false}
              placeholder={'version: 1\nname: My Hall\n…'}
              aria-label={texts.textLabel}
            />
          </label>
          <div className="actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setText(exampleYaml);
                setFileNote(texts.exampleLoaded(exampleName));
                setFailure(null);
              }}
            >
              {texts.loadExample}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={empty}
              onClick={() => {
                setText('');
                setFileNote(null);
                setFailure(null);
              }}
            >
              {texts.clear}
            </button>
          </div>
        </section>

        <section className="panel" aria-labelledby="preview-title" aria-live="polite">
          <h2 id="preview-title">{texts.previewTitle}</h2>
          {empty ? <p className="muted">{texts.previewEmpty}</p> : null}
          {!empty && !check.ok ? (
            <>
              <p className="verdict" data-state="error" data-testid="verdict">
                {texts.rejected(check.errors.length)}
              </p>
              <IssueList issues={[...check.errors, ...check.warnings]} />
            </>
          ) : null}
          {hall && check.ok ? (
            <>
              <p className="verdict" data-state="ok" data-testid="verdict">
                {texts.passed(hall.config.name, hall.layout.seats.length)}
              </p>
              <div className="hall-thumb-frame">
                <HallThumb
                  layout={hall.layout}
                  label={t.common.hallPlan(hall.config.name)}
                  levelName={t.common.planLevel}
                />
              </div>
              <table className="tier-table">
                <caption className="visually-hidden">{t.common.seatTypesAndPrices}</caption>
                <thead>
                  <tr>
                    <th scope="col">{texts.tier}</th>
                    <th scope="col">{texts.seats}</th>
                    <th scope="col">{texts.price}</th>
                  </tr>
                </thead>
                <tbody>
                  {hall.tiers.map((tier) => (
                    <tr key={tier.tier}>
                      <td>
                        <span className="swatch" style={{ background: tier.color }} />
                        {tier.label}
                      </td>
                      <td>{tier.count}</td>
                      <td>{tier.price === null ? '—' : formatPrice(tier.price, LOCALE)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {idNote ? (
                <p className="id-note" role="note" data-testid="id-note">
                  {texts.idNote(idNote.requested, idNote.id)}
                </p>
              ) : null}
              <IssueList issues={check.warnings} title={texts.warningsTitle} />
            </>
          ) : null}
        </section>
      </div>

      <section className="panel" aria-labelledby="gen-title">
        <h2 id="gen-title">{texts.showtimesTitle}</h2>
        <p className="muted">{texts.showtimesText}</p>
        <ShowtimeFields
          form={form}
          today={today}
          tiers={hall?.tiers ?? null}
          noTiersText={t.showtimeForm.noTiers}
        >
          <label className="field">
            <span>{texts.cinema}</span>
            <input
              type="text"
              value={cinema}
              maxLength={60}
              onChange={(event) => setCinema(event.target.value)}
            />
          </label>
        </ShowtimeFields>
        {!generator ? <p className="plan">{texts.noShowtimes}</p> : null}
      </section>

      {failure ? (
        <section className="panel" role="alert" data-testid="server-failure">
          <p className="verdict" data-state="error">
            {texts.serverRejected(failure.message)}
          </p>
          <IssueList issues={failure.issues} />
        </section>
      ) : null}

      <div className="submit-row">
        <button
          type="button"
          className="button"
          disabled={!canCreate}
          onClick={() => void submit()}
        >
          {submitting ? texts.creating : texts.create}
        </button>
        {!hall && !empty ? <span className="muted">{texts.fixErrors}</span> : null}
      </div>
    </main>
  );
}
