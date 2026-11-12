import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getSessionPage } from '@/lib/server/store';
import { BookingClient } from './booking-client';

// Sessions are looked up in the in-memory backend on every request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}): Promise<Metadata> {
  const { sessionId } = await params;
  const data = getSessionPage(sessionId);
  if (!data) return { robots: { index: false, follow: false } };
  const title = `${data.hallName} Seat Picker Demo | Cinema Hall Kit`;
  const description = `Preview seat selection for a sample ${data.format} showtime at ${data.hallName}. This demo uses in-memory mock booking data.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/sessions/${encodeURIComponent(sessionId)}` },
    robots: { index: false, follow: true },
    openGraph: { title, description, url: `/sessions/${encodeURIComponent(sessionId)}` },
    twitter: { card: 'summary_large_image', title, description },
  };
}

/**
 * Server Component. Session → hall version → config, parsed strictly here; the header and the showtime chips come from the session's hall. Only the plain
 * `config` object crosses to the client; the layout is computed there (api.md §1).
 */
export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const data = getSessionPage(sessionId);
  if (!data) notFound();

  const { config } = data;
  return (
    <Suspense fallback={<p className="loading">Loading hall…</p>}>
      <BookingClient
        key={sessionId}
        config={config}
        versionRev={data.versionRev}
        sessionId={sessionId}
        {...(data.cinema ? { cinema: data.cinema } : {})}
        hallName={data.hallName}
        dateLabel={data.dateLabel}
        format={data.format}
        showtimes={data.showtimes}
      />
    </Suspense>
  );
}
