import { notFound } from 'next/navigation';
import { hallCard } from '@/lib/server/cards';
import { findHall } from '@/lib/server/store';
import { withCardTexts } from '@/lib/shared/sample-texts';
import { todayIso } from '@/lib/shared/generator';
import type { Metadata } from 'next';
import { AddShowtimesClient } from './add-showtimes-client';

// The hall and the server's date are read on every request.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { absolute: 'Add Showtimes | Cinema Hall Kit' },
  description: 'Add showtimes to a hall of the Cinema Hall Kit demo.',
  robots: { index: false, follow: true },
};

/**
 * Server Component: the hall with its showtimes and tiers, and the server's today. The client form
 * sends the generator input to `POST /api/halls/[hallId]/sessions`.
 */
export default async function AddShowtimesPage({
  params,
}: {
  params: Promise<{ hallId: string }>;
}) {
  const { hallId } = await params;
  const hall = findHall(hallId);
  const card = hall ? hallCard(hall) : undefined;
  if (!card) notFound();
  return <AddShowtimesClient key={card.id} hall={withCardTexts(card)} today={todayIso()} />;
}
