import Link from 'next/link';
import { formatPrice } from '@cinema-hall/core';
import { allHallCards } from '@/lib/server/cards';
import { findHall, layoutOf } from '@/lib/server/store';
import { dateShort } from '@/lib/shared/dates';
import { bandText, withCardTexts } from '@/lib/shared/sample-texts';
import { LOCALE, t } from '@/lib/shared/texts';
import type { HallCard, SessionView } from '@/lib/shared/types';
import { HallThumb } from './_components/hall-thumb';
import { NewHallChooser } from './_components/new-hall-chooser';
import { pageMetadata } from '@/lib/seo';

// Halls and sessions live in the in-memory backend and change at runtime.
export const dynamic = 'force-dynamic';

const VISIBLE_CHIPS = 8;

export const metadata = pageMetadata({
  title: 'Cinema Hall Builder and Seat Picker Demo',
  description:
    'Try the Cinema Hall Kit demo: explore sample halls, configure a layout, and preview seat selection. Demo data is kept in server memory.',
  path: '/',
});

/**
 * Start screen for a cinema administrator: create a hall, see the halls with their showtimes, add
 * showtimes and open one to sell tickets. Developer notes come last. Server Component: halls come
 * straight from the in-memory backend.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; requested?: string }>;
}) {
  const { new: newHallId, requested } = await searchParams;
  const halls = allHallCards().map((card) => withCardTexts(card));
  const created = halls.find((hall) => hall.id === newHallId);
  return (
    <main className="landing">
      <p className="eyebrow">{t.home.eyebrow}</p>
      <h1>{t.home.title}</h1>
      <p className="lede">{t.home.lede}</p>
      <p className="demo-note" data-testid="demo-note">
        {t.home.demoNote}
      </p>

      {created ? (
        <div className="banner" role="status" data-testid="created-banner">
          <p>{t.home.created(created.name, created.sessions.length)}</p>
          {requested && requested !== created.id ? (
            <p className="muted" data-testid="renamed-note">
              {t.home.renamed(requested, created.id)}
            </p>
          ) : null}
        </div>
      ) : null}

      <section className="panel create-panel" aria-labelledby="create-title">
        <h2 id="create-title">{t.common.createNewHall}</h2>
        <NewHallChooser halls={halls.map((hall) => ({ id: hall.id, name: hall.name }))} />
      </section>

      <h2 className="section-title">{t.home.hallsTitle}</h2>
      <div className="hall-grid">
        {halls.map((hall) => (
          <HallCardView key={hall.id} hall={hall} highlighted={hall.id === newHallId} />
        ))}
      </div>

      <section className="dev-section" aria-labelledby="dev-title">
        <h2 id="dev-title">{t.home.devTitle}</h2>
        <p className="muted">
          {t.home.devBefore} <code>@cinema-hall/core</code> {t.home.devCore}{' '}
          <code>@cinema-hall/react</code> {t.home.devReact}{' '}
          <Link href="/halls/new">{t.home.devImport}</Link> {t.home.devAfter}
        </p>
      </section>
    </main>
  );
}

interface CardProps {
  hall: HallCard;
  highlighted: boolean;
}

function HallCardView({ hall, highlighted }: CardProps) {
  const record = findHall(hall.id);
  const layout = record ? layoutOf(record.currentVersionId) : undefined;
  const visible = hall.sessions.slice(0, VISIBLE_CHIPS);
  const rest = hall.sessions.slice(VISIBLE_CHIPS);
  const older = hall.sessions.filter((session) => session.versionRev !== hall.currentRev);
  const id = encodeURIComponent(hall.id);
  const chip = (session: SessionView) => (
    <SessionChip key={session.id} session={session} currentRev={hall.currentRev} />
  );
  return (
    <article
      className="hall-card"
      id={`hall-${hall.id}`}
      data-testid="hall-card"
      data-hall-id={hall.id}
      data-highlighted={highlighted ? '' : undefined}
    >
      <div className="hall-thumb-frame">
        {layout ? (
          <HallThumb
            layout={layout}
            label={t.common.hallPlan(hall.name)}
            levelName={t.common.planLevel}
            bandName={(bandId, label) => (hall.sample ? (bandText(bandId, label) ?? label) : label)}
          />
        ) : null}
      </div>
      <div className="hall-card-body">
        <h3>
          {hall.name}
          {hall.sample ? (
            <span className="badge" data-testid="sample-badge">
              {t.home.sample}
            </span>
          ) : null}
        </h3>
        <p className="muted">
          {hall.cinema ? `${hall.cinema} · ` : ''}
          {t.home.hallFacts(hall.seats, hall.currentRev)}
        </p>
        <ul className="tier-list" aria-label={t.common.seatTypesAndPrices}>
          {hall.tiers.map((tier) => (
            <li key={tier.tier}>
              <span className="swatch" style={{ background: tier.color }} aria-hidden="true" />
              {tier.label}
              {tier.price === null ? '' : ` · ${formatPrice(tier.price, LOCALE)}`}
            </li>
          ))}
        </ul>
        {hall.sessions.length === 0 ? (
          <p className="muted">{t.common.noShowtimes}</p>
        ) : (
          <>
            <p className="chips-title">{t.home.showtimesTitle}</p>
            <ul className="chip-list">{visible.map(chip)}</ul>
            {rest.length > 0 ? (
              <details className="more">
                <summary>{t.home.moreShowtimes(rest.length)}</summary>
                <ul className="chip-list">{rest.map(chip)}</ul>
              </details>
            ) : null}
            {older.length > 0 && older[0] ? (
              <p className="muted version-note" data-testid="version-note">
                {t.home.versionNote(older[0].versionRev, older[0].seats, hall.currentRev)}
              </p>
            ) : null}
          </>
        )}
        <div className="actions card-actions">
          <Link href={`/halls/${id}/showtimes`} className="button" data-testid="add-showtimes">
            {t.home.manageShowtimes}
          </Link>
          <Link href={`/constructor?hall=${id}`} className="button secondary">
            {t.home.editHall}
          </Link>
          <Link href={`/constructor?copy=${id}`} className="button secondary">
            {t.home.copy}
          </Link>
        </div>
      </div>
    </article>
  );
}

function SessionChip({ session, currentRev }: { session: SessionView; currentRev: number }) {
  const older = session.versionRev !== currentRev;
  return (
    <li>
      <Link
        href={`/sessions/${session.id}`}
        className="session-chip"
        data-testid="session-chip"
        data-version={session.versionRev}
        title={older ? t.home.chipOlder(session.versionRev) : undefined}
      >
        {dateShort(session.date)} · {session.time} · {session.format}
        {older ? <span className="chip-version"> · v{session.versionRev}</span> : null}
      </Link>
    </li>
  );
}
