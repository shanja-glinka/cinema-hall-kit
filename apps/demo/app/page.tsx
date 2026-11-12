import Link from 'next/link';
import { allHallCards } from '@/lib/server/cards';
import { findHall, layoutOf } from '@/lib/server/store';
import type { HallCard, SessionView } from '@/lib/shared/types';
import { formatPrice } from '@cinema-hall/core';
import { HallThumb } from './_components/hall-thumb';
import { pageMetadata } from '@/lib/seo';

// Halls and sessions live in the in-memory backend and change at runtime.
export const dynamic = 'force-dynamic';

const VISIBLE_CHIPS = 8;
const VISIBLE_HALL_LINKS = 5;

const TEMPLATES: readonly { id: string; label: string }[] = [
  { id: 'single', label: 'Blank template: single block' },
  { id: 'threeSections', label: 'Blank template: three sections' },
  { id: 'stadium', label: 'Blank template: stadium' },
];

/**
 * Start screen: pick a ready-made hall and one of its sessions, upload your own hall, or open the
 * constructor. Server Component: halls come straight from the in-memory backend.
 */
export const metadata = pageMetadata({
  title: 'Cinema Hall Builder and Seat Picker Demo',
  description:
    'Try the Cinema Hall Kit demo: explore sample halls, configure a layout, and preview seat selection. Demo data is kept in server memory.',
  path: '/',
});

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const { new: newHallId } = await searchParams;
  const halls = allHallCards();
  const created = halls.find((hall) => hall.id === newHallId);
  return (
    <main className="landing">
      <p className="eyebrow">Demo · @cinema-hall/core · @cinema-hall/react</p>
      <h1>Choose a hall</h1>
      <p className="lede">
        Explore the guest and operator flows in one app:{' '}
        <strong>YAML → hall → showtimes → booking</strong>. Open a sample showtime, upload your own
        YAML and generate showtimes, or edit a hall in the constructor. Demo data lives in server
        memory and resets when the server restarts.
      </p>

      {created ? (
        <p className="banner" role="status" data-testid="created-banner">
          Hall “{created.name}” created with {created.sessions.length} showtimes. It is highlighted
          below.
        </p>
      ) : null}

      <h2 className="section-title">Sample halls</h2>
      <div className="hall-grid">
        {halls.map((hall) => (
          <HallCardView key={hall.id} hall={hall} highlighted={hall.id === newHallId} />
        ))}
      </div>

      <h2 className="section-title">Your hall</h2>
      <div className="cards">
        <section className="card">
          <h3>Upload a hall</h3>
          <p className="muted">
            Paste or upload YAML to validate and preview a hall layout. Set dates and times, and the
            server will create the hall with showtimes.
          </p>
          <div className="actions">
            <Link href="/halls/new" className="button">
              Upload YAML
            </Link>
          </div>
        </section>

        <section className="card">
          <h3>Hall constructor</h3>
          <p className="muted">
            Edit a hall with a live preview and validation. Saving creates a new hall version;
            future showtimes can be moved to it.
          </p>
          <ConstructorLinks halls={halls} />
        </section>
      </div>
    </main>
  );
}

function HallCardView({ hall, highlighted }: { hall: HallCard; highlighted: boolean }) {
  const record = findHall(hall.id);
  const layout = record ? layoutOf(record.currentVersionId) : undefined;
  const visible = hall.sessions.slice(0, VISIBLE_CHIPS);
  const rest = hall.sessions.slice(VISIBLE_CHIPS);
  return (
    <article
      className="hall-card"
      id={`hall-${hall.id}`}
      data-testid="hall-card"
      data-hall-id={hall.id}
      data-highlighted={highlighted ? '' : undefined}
    >
      <div className="hall-thumb-frame">
        {layout ? <HallThumb layout={layout} label={`${hall.name} hall plan`} /> : null}
      </div>
      <div className="hall-card-body">
        <h3>{hall.name}</h3>
        <p className="muted">
          {hall.cinema ? `${hall.cinema} · ` : ''}
          {hall.seats} seats · version {hall.currentRev}
        </p>
        <ul className="tier-list" aria-label="Seat types and prices">
          {hall.tiers.map((tier) => (
            <li key={tier.tier}>
              <span className="swatch" style={{ background: tier.color }} aria-hidden="true" />
              {tier.label}
              {tier.price === null ? '' : ` · ${formatPrice(tier.price, 'en-US')}`}
            </li>
          ))}
        </ul>
        {hall.sessions.length === 0 ? (
          <p className="muted">No showtimes yet.</p>
        ) : (
          <>
            <p className="chips-title">Showtimes</p>
            <ul className="chip-list">
              {visible.map((session) => (
                <SessionChip key={session.id} session={session} />
              ))}
            </ul>
            {rest.length > 0 ? (
              <details className="more">
                <summary>More showtimes: {rest.length}</summary>
                <ul className="chip-list">
                  {rest.map((session) => (
                    <SessionChip key={session.id} session={session} />
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

function SessionChip({ session }: { session: SessionView }) {
  return (
    <li>
      <Link href={`/sessions/${session.id}`} className="session-chip" data-testid="session-chip">
        {session.dateShort} · {session.time} · {session.format}
      </Link>
    </li>
  );
}

function ConstructorLinks({ halls }: { halls: HallCard[] }) {
  const shown = halls.slice(0, VISIBLE_HALL_LINKS);
  const rest = halls.slice(VISIBLE_HALL_LINKS);
  return (
    <>
      <p className="chips-title">Edit a sample hall</p>
      <ul className="link-list">
        {shown.map((hall) => (
          <li key={hall.id}>
            <Link href={`/constructor?hall=${encodeURIComponent(hall.id)}`}>{hall.name}</Link>
          </li>
        ))}
      </ul>
      {rest.length > 0 ? (
        <details className="more">
          <summary>More halls: {rest.length}</summary>
          <ul className="link-list">
            {rest.map((hall) => (
              <li key={hall.id}>
                <Link href={`/constructor?hall=${encodeURIComponent(hall.id)}`}>{hall.name}</Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="chips-title">Start from scratch</p>
      <ul className="link-list">
        {TEMPLATES.map((template) => (
          <li key={template.id}>
            <Link href={`/constructor?template=${template.id}`}>{template.label}</Link>
          </li>
        ))}
      </ul>
    </>
  );
}
