'use client';

import Link from 'next/link';
import { useState } from 'react';
import { t } from '@/lib/shared/texts';
import { ShowtimeFields, useShowtimeForm } from '@/app/_components/showtime-form';
import { dateShort, showtimeLabel } from '@/lib/shared/dates';
import {
  isDeleteSessionResponse,
  isSessionsResponse,
  type HallCard,
  type SessionView,
} from '@/lib/shared/types';
import '../../new/new-hall.css';

interface AddShowtimesClientProps {
  hall: HallCard;
  /** The server's today, `YYYY-MM-DD`. */
  today: string;
}

/**
 * The showtimes of a hall: adds new ones with the same generator as the import page (sent to
 * `POST /api/halls/[hallId]/sessions`; they use the hall's current layout), and lists the existing
 * ones, each with a way to delete it (`DELETE /api/halls/[hallId]/sessions/[sessionId]`, after a
 * confirmation; the server refuses while seats are sold or temporarily reserved, and says why).
 * @param props The hall and the server's date.
 * @returns The page.
 */
export function AddShowtimesClient({ hall, today }: AddShowtimesClientProps) {
  const texts = t.addShowtimes;
  const form = useShowtimeForm(today, hall.tiers, '19:00');
  const [sessions, setSessions] = useState<SessionView[]>(hall.sessions);
  const [added, setAdded] = useState<{ sessions: SessionView[]; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** The showtime whose deletion is being confirmed or sent. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  /** Why a deletion was refused, by showtime. */
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [deletedNote, setDeletedNote] = useState<string | null>(null);

  const removeShowtime = async (session: SessionView): Promise<void> => {
    setDeleting(session.id);
    setDeletedNote(null);
    setDeleteErrors(({ [session.id]: _gone, ...rest }) => rest);
    let message: string | null = null;
    try {
      const response = await fetch(
        `/api/halls/${encodeURIComponent(hall.id)}/sessions/${encodeURIComponent(session.id)}`,
        { method: 'DELETE' },
      );
      const body: unknown = await response.json();
      if (!isDeleteSessionResponse(body)) throw new Error(`DELETE session: ${response.status}`);
      if (body.ok || body.error === 'session_not_found') {
        // Gone either way: it leaves the lists.
        setSessions((current) => current.filter((entry) => entry.id !== session.id));
        setAdded((current) =>
          current
            ? { ...current, sessions: current.sessions.filter((entry) => entry.id !== session.id) }
            : current,
        );
        setDeletedNote(texts.deleted(showtimeLabel(session.date, session.time)));
      } else {
        message = body.message;
      }
    } catch {
      message = t.common.networkError;
    }
    if (message !== null) {
      const text = message;
      setDeleteErrors((current) => ({ ...current, [session.id]: text }));
    }
    setConfirming(null);
    setDeleting(null);
  };
  const planError = form.plan && !form.plan.ok ? form.plan : null;
  const canAdd = form.generator !== null && planError === null && !submitting;

  const submit = async (): Promise<void> => {
    if (!form.generator) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/halls/${encodeURIComponent(hall.id)}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form.generator),
      });
      const body: unknown = await response.json();
      if (!isSessionsResponse(body)) throw new Error(`POST sessions: ${response.status}`);
      if (body.ok) {
        setAdded({ sessions: body.sessions, skipped: body.skipped });
        setSessions((current) =>
          [...current, ...body.sessions].sort(
            (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
          ),
        );
      } else {
        setError(body.message);
      }
    } catch {
      setError(t.common.networkError);
    }
    setSubmitting(false);
  };

  return (
    <main className="new-hall">
      <header className="page-head">
        <p>
          <Link href="/">{t.common.allHalls}</Link>
        </p>
        <h1>{texts.title(hall.name)}</h1>
        <p className="muted">{texts.lede(hall.seats)}</p>
      </header>

      {added ? (
        <section className="panel added-panel" role="status" data-testid="showtimes-added">
          <h2>
            {added.sessions.length === 0 ? texts.noneAdded : texts.added(added.sessions.length)}
          </h2>
          {added.skipped > 0 ? <p className="muted">{texts.skipped(added.skipped)}</p> : null}
          {added.sessions.length > 0 ? (
            <>
              <p className="muted">{texts.openOne}</p>
              <ul className="chip-list">
                {added.sessions.map((session) => (
                  <li key={session.id}>
                    <Link
                      href={`/sessions/${session.id}`}
                      className="session-chip"
                      data-testid="added-chip"
                    >
                      {dateShort(session.date)} · {session.time} · {session.format}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      <section className="panel" aria-labelledby="gen-title">
        <h2 id="gen-title">{texts.newTitle}</h2>
        <ShowtimeFields form={form} today={today} tiers={hall.tiers} />
        {!form.generator ? <p className="plan">{texts.enterTime}</p> : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="submit-row actions">
          <button type="button" className="button" disabled={!canAdd} onClick={() => void submit()}>
            {submitting ? texts.adding : t.common.addShowtimes}
          </button>
        </div>
      </section>

      <section className="panel" aria-labelledby="existing-title">
        <h2 id="existing-title">{texts.existingTitle}</h2>
        {deletedNote ? (
          <p className="muted" role="status" data-testid="showtime-deleted">
            {deletedNote}
          </p>
        ) : null}
        {sessions.length === 0 ? (
          <p className="muted">{t.common.noShowtimes}</p>
        ) : (
          <ul className="showtime-rows" data-testid="showtime-list">
            {sessions.map((session) => {
              const name = showtimeLabel(session.date, session.time);
              const error = deleteErrors[session.id];
              return (
                <li
                  key={session.id}
                  className="showtime-row"
                  data-testid="showtime-row"
                  data-session-id={session.id}
                >
                  <Link href={`/sessions/${session.id}`} className="session-chip">
                    {dateShort(session.date)} · {session.time} · {session.format}
                    {session.versionRev !== hall.currentRev ? ` · v${session.versionRev}` : ''}
                  </Link>
                  {confirming === session.id ? (
                    <span
                      className="confirm-delete"
                      role="group"
                      aria-label={texts.deleteConfirm(name)}
                    >
                      <span>{texts.deleteConfirm(name)}</span>
                      <button
                        type="button"
                        className="button small danger"
                        data-testid="confirm-delete"
                        disabled={deleting === session.id}
                        onClick={() => void removeShowtime(session)}
                      >
                        {deleting === session.id ? texts.deleting : texts.deleteYes}
                      </button>
                      <button
                        type="button"
                        className="button secondary small"
                        disabled={deleting === session.id}
                        onClick={() => setConfirming(null)}
                      >
                        {texts.deleteNo}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="button secondary small"
                      data-testid="delete-showtime"
                      aria-label={texts.deleteShowtimeAria(name)}
                      onClick={() => setConfirming(session.id)}
                    >
                      {texts.deleteShowtime}
                    </button>
                  )}
                  {error ? (
                    <p className="form-error delete-error" role="alert" data-testid="delete-error">
                      {error}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
