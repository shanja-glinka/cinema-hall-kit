import { notFound } from 'next/navigation';
import { builtInTemplates, parseHallConfig, serializeHallConfig } from '@cinema-hall/core';
import { getHallResponse } from '@/lib/server/halls';
import { pageMetadata } from '@/lib/seo';
import { HALL_ID, sessionsOfHall } from '@/lib/server/store';
import { ConstructorClient } from './constructor-client';

export const metadata = pageMetadata({
  title: 'Interactive Hall Constructor',
  description:
    'Explore the Cinema Hall Kit constructor with a live layout preview, validation, and editable sample templates.',
  path: '/constructor',
});

// The hall is read from the in-memory backend on every request, never prerendered.
export const dynamic = 'force-dynamic';

/**
 * Server Component. `?hall=<id>` edits that hall (the Orbita hall without it); `?template=<id>`
 * starts from a built-in template and creates the hall on the first save. The config is parsed
 * strictly here, so the editor starts from a valid config. Only plain data crosses to the client.
 */
export default async function ConstructorPage({
  searchParams,
}: {
  searchParams: Promise<{ hall?: string; template?: string }>;
}) {
  const { hall: hallParam, template: templateParam } = await searchParams;

  if (templateParam !== undefined) {
    const template = builtInTemplates.find((candidate) => candidate.id === templateParam);
    if (!template) notFound();
    const { config } = parseHallConfig(template.create(), { strict: true });
    return (
      <ConstructorClient
        key={`template:${template.id}`}
        config={config}
        source={serializeHallConfig(config)}
        revision={null}
        hallId={null}
        draftId={`template:${template.id}`}
        firstSessionId={null}
      />
    );
  }

  const hallId = hallParam ?? HALL_ID;
  const hall = getHallResponse(hallId);
  if (!hall) notFound();
  const { config } = parseHallConfig(hall.config, { strict: true });
  return (
    <ConstructorClient
      key={hallId}
      config={config}
      source={hall.source}
      revision={hall.revision}
      hallId={hallId}
      draftId={hallId}
      firstSessionId={sessionsOfHall(hallId)[0]?.id ?? null}
    />
  );
}
