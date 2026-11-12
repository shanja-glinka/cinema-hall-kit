'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useMemo, useState, type ChangeEvent, type DragEvent } from 'react';
import { buildHallLayout, formatPrice } from '@cinema-hall/core';
import { HallThumb } from '@/app/_components/hall-thumb';
import { IssueList } from '@/app/_components/issue-list';
import {
  DEFAULT_OCCUPANCY_PERCENT,
  addDays,
  normalizeTime,
  planSessions,
  splitTimes,
} from '@/lib/shared/generator';
import { checkHallText, tiersOf } from '@/lib/shared/hall-check';
import {
  isCreateHallResponse,
  type CreateHallBody,
  type GeneratorInput,
  type IssueView,
} from '@/lib/shared/types';
import './new-hall.css';

const MAX_FILE_BYTES = 256 * 1024;
const FORMAT_SUGGESTIONS = ['2D', '3D', 'LUX'];
const DEFAULT_FORMATS: Record<string, string> = { '12:00': '2D', '18:30': 'LUX' };

interface NewHallClientProps {
  exampleYaml: string;
  /** The server's today, `YYYY-MM-DD`. */
  today: string;
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
export function NewHallClient({ exampleYaml, today }: NewHallClientProps) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [cinema, setCinema] = useState('');
  const [from, setFrom] = useState(() => addDays(today, 1));
  const [to, setTo] = useState(() => addDays(today, 2));
  const [timesText, setTimesText] = useState('12:00, 18:30');
  const [formats, setFormats] = useState<Record<string, string>>(DEFAULT_FORMATS);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [occupancy, setOccupancy] = useState(String(DEFAULT_OCCUPANCY_PERCENT));
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

  const times = splitTimes(timesText);
  const generator: GeneratorInput | null = useMemo(() => {
    if (splitTimes(timesText).length === 0) return null;
    // Price drafts of tiers that the current hall does not have are left out: their inputs are
    // not on the page any more, so they could neither be fixed nor cleared.
    const knownTiers = new Set(hall?.tiers.map((tier) => tier.tier));
    return {
      from,
      to,
      slots: splitTimes(timesText).map((token) => {
        const time = normalizeTime(token) ?? token;
        return { time, format: formats[time] ?? formats[token] ?? '2D' };
      }),
      prices: Object.fromEntries(Object.entries(prices).filter(([tier]) => knownTiers.has(tier))),
      occupancyPercent: occupancy,
    };
  }, [hall, from, to, timesText, formats, prices, occupancy]);
  const plan = useMemo(
    () => (hall && generator ? planSessions('preview', generator, hall.tiers, today) : null),
    [hall, generator, today],
  );

  const empty = text.trim() === '';
  const stale = text !== deferredText;
  const planError = plan && !plan.ok ? plan : null;
  const canCreate = hall !== null && !stale && !submitting && planError === null;

  const loadFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setFailure(null);
    if (file.size > MAX_FILE_BYTES) {
      setFileNote(`File “${file.name}” is larger than 256 KB and is not a hall config.`);
      return;
    }
    const content = await file.text();
    if (content.includes('\u0000')) {
      setFileNote(`File “${file.name}” is not a text file.`);
      return;
    }
    setFileNote(`Loaded file “${file.name}”.`);
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
        router.push(`/?new=${encodeURIComponent(result.hall.id)}`);
        return;
      }
      setFailure({ message: result.message, issues: result.issues ?? [] });
    } catch {
      setFailure({ message: 'Could not reach the server. Please try again.', issues: [] });
    }
    setSubmitting(false);
  };

  return (
    <main className="new-hall">
      <header className="page-head">
        <p>
          <Link href="/">← Choose a hall</Link>
        </p>
        <h1>Upload a hall</h1>
        <p className="muted">
          YAML → hall → showtimes → booking. Browser validation is immediate, and the server
          validates the hall again before creating it.
        </p>
      </header>

      <div className="new-hall-grid">
        <section className="panel" aria-labelledby="source-title">
          <h2 id="source-title">1. Hall configuration</h2>
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
              aria-label="Hall configuration file"
            />
            <strong>Drop a file here or choose one</strong>
            <span className="muted">.yaml, .yml or .json, up to 256 KB</span>
          </label>
          <p className="muted">
            Hall text: up to 256 KB. The full request (JSON text and showtime settings) can be up to
            576 KB.
          </p>
          {fileNote ? (
            <p className="muted" role="status">
              {fileNote}
            </p>
          ) : null}

          <label className="field">
            <span>Or paste text</span>
            <textarea
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setFailure(null);
              }}
              rows={14}
              spellCheck={false}
              placeholder={'version: 1\nname: My Hall\n…'}
              aria-label="Hall YAML"
            />
          </label>
          <div className="actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setText(exampleYaml);
                setFileNote('Example loaded: “My Hall”.');
                setFailure(null);
              }}
            >
              Load example
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
              Clear
            </button>
          </div>
        </section>

        <section className="panel" aria-labelledby="preview-title" aria-live="polite">
          <h2 id="preview-title">2. Validation and preview</h2>
          {empty ? (
            <p className="muted">
              Validation results and the hall plan will appear here. Start with the example if you
              are not sure where to begin.
            </p>
          ) : null}
          {!empty && !check.ok ? (
            <>
              <p className="verdict" data-state="error" data-testid="verdict">
                Hall rejected: {check.errors.length} errors
              </p>
              <IssueList issues={[...check.errors, ...check.warnings]} />
            </>
          ) : null}
          {hall && check.ok ? (
            <>
              <p className="verdict" data-state="ok" data-testid="verdict">
                Hall “{hall.config.name}” passed validation: {hall.layout.seats.length} seats
              </p>
              <div className="hall-thumb-frame">
                <HallThumb layout={hall.layout} label={`${hall.config.name} hall plan`} />
              </div>
              <table className="tier-table">
                <caption className="visually-hidden">Seat types and prices</caption>
                <thead>
                  <tr>
                    <th scope="col">Price tier</th>
                    <th scope="col">Seats</th>
                    <th scope="col">Price</th>
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
                      <td>{tier.price === null ? '—' : formatPrice(tier.price, 'en-US')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <IssueList issues={check.warnings} title="Warnings (do not prevent hall creation)" />
            </>
          ) : null}
        </section>
      </div>

      <section className="panel" aria-labelledby="gen-title">
        <h2 id="gen-title">3. Showtimes</h2>
        <p className="muted">
          The server creates a showtime for every date and time in the range. Clear the time field
          to create a hall without showtimes. Prices have no currency; the interface displays the
          “¤” sign.
        </p>
        <div className="form-grid">
          <label className="field">
            <span>Cinema (optional)</span>
            <input
              type="text"
              value={cinema}
              maxLength={60}
              onChange={(event) => setCinema(event.target.value)}
            />
          </label>
          <label className="field">
            <span>From date</span>
            <input type="date" value={from} min={today} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>Through date</span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="field">
            <span>Showtime times</span>
            <input
              type="text"
              value={timesText}
              onChange={(event) => setTimesText(event.target.value)}
              placeholder="10:00, 13:30, 17:00, 20:30"
            />
          </label>
          <label className="field">
            <span>Seats occupied, %</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={occupancy}
              onChange={(event) => setOccupancy(event.target.value)}
            />
          </label>
        </div>

        {times.length > 0 ? (
          <fieldset className="formats">
            <legend>Showtime format</legend>
            <datalist id="format-suggestions">
              {FORMAT_SUGGESTIONS.map((format) => (
                <option key={format} value={format} />
              ))}
            </datalist>
            {times.map((token) => {
              const time = normalizeTime(token) ?? token;
              return (
                <label className="field" key={token}>
                  <span>Format · {time}</span>
                  <input
                    type="text"
                    list="format-suggestions"
                    maxLength={16}
                    value={formats[time] ?? formats[token] ?? '2D'}
                    onChange={(event) =>
                      setFormats((current) => ({ ...current, [time]: event.target.value }))
                    }
                  />
                </label>
              );
            })}
          </fieldset>
        ) : null}

        {hall ? (
          <fieldset className="formats">
            <legend>Showtime prices, if they differ from the hall prices</legend>
            {hall.tiers.map((tier) => (
              <label className="field" key={tier.tier}>
                <span>Price · {tier.label}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={prices[tier.tier] ?? ''}
                  placeholder={tier.price === null ? 'no price' : String(tier.price)}
                  onChange={(event) =>
                    setPrices((current) => ({ ...current, [tier.tier]: event.target.value }))
                  }
                />
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="muted">Price fields appear after the hall passes validation.</p>
        )}

        {planError ? (
          <p className="form-error" role="alert" data-field={planError.field}>
            {planError.message}
          </p>
        ) : null}
        {plan && plan.ok ? (
          <p className="plan" data-testid="plan">
            Showtimes to create: {plan.specs.length}
            {plan.specs[0] ? ` · first: ${plan.specs[0].date} ${plan.specs[0].time}` : ''}
          </p>
        ) : null}
        {!generator ? <p className="plan">The hall will be created without showtimes.</p> : null}
      </section>

      {failure ? (
        <section className="panel" role="alert" data-testid="server-failure">
          <p className="verdict" data-state="error">
            Server rejected the request: {failure.message}
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
          {submitting ? 'Creating…' : 'Create hall'}
        </button>
        {!hall && !empty ? (
          <span className="muted">Fix the errors before creating the hall.</span>
        ) : null}
      </div>
    </main>
  );
}
