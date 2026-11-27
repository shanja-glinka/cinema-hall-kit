import Link from 'next/link';
import { notFound } from 'next/navigation';
import { builtInTemplates, parseHallConfig, serializeHallConfig } from '@cinema-hall/core';
import { NewHallChooser } from '@/app/_components/new-hall-chooser';
import { allHallCards } from '@/lib/server/cards';
import { MAX_STORED_YAML_BYTES } from '@/lib/server/body-limit';
import { getHallResponse } from '@/lib/server/halls';
import { listSessions } from '@/lib/server/sessions';
import { findHall } from '@/lib/server/store';
import {
  copyName,
  hallHeader,
  prepareCopyWithin,
  replaceHeaderComment,
} from '@/lib/shared/hall-text';
import { sampleTextsFor } from '@/lib/shared/sample-texts';
import { t } from '@/lib/shared/texts';
import { templateChoices } from '@/lib/shared/templates';
import { pageMetadata } from '@/lib/seo';
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
 * Server Component.
 * - `?hall=<id>` edits that hall.
 * - `?template=<id>` starts a new hall from a built-in template, with its texts and prices.
 * - `?copy=<id>` starts a new hall from a copy of an existing one (new name, no id, own header).
 * - Without parameters it asks what to do, so a sample hall is never opened for editing by
 *   accident.
 * A new hall is created on its first save. The config is parsed strictly here, so the editor
 * starts from a valid config. Only plain data crosses to the client.
 */
export default async function ConstructorPage({
  searchParams,
}: {
  searchParams: Promise<{ hall?: string; template?: string; copy?: string }>;
}) {
  const { hall: hallParam, template: templateParam, copy: copyParam } = await searchParams;
  const texts = t.constructorChooser;

  if (templateParam !== undefined) {
    const template = builtInTemplates.find((candidate) => candidate.id === templateParam);
    if (!template) notFound();
    const { config } = parseHallConfig(template.create(), { strict: true });
    const title =
      templateChoices(builtInTemplates).find((choice) => choice.id === template.id)?.title ??
      template.label;
    return (
      <ConstructorClient
        key={`template:${template.id}`}
        config={config}
        source={replaceHeaderComment(serializeHallConfig(config), hallHeader(config.name))}
        revision={null}
        hallId={null}
        draftId={`template:${template.id}`}
        existing={null}
        origin={texts.originTemplate(title)}
      />
    );
  }

  if (copyParam !== undefined) {
    const original = getHallResponse(copyParam);
    if (!original) notFound();
    // Older wording is updated only in the halls the demo ships: a copy of a hall someone made
    // keeps the labels they typed.
    const fromSample = findHall(copyParam)?.sample === true;
    const name = copyName(original.config.name);
    // A hall stored at the size limit can outgrow it with its new name and header: the page then
    // says so and links to the hall, instead of failing.
    const source = prepareCopyWithin(original.source, { name }, MAX_STORED_YAML_BYTES);
    if (source === null) {
      return <CopyTooLarge hallId={copyParam} name={original.config.name} />;
    }
    const { config } = parseHallConfig(source, {
      format: 'yaml',
      strict: true,
      maxBytes: MAX_STORED_YAML_BYTES,
    });
    return (
      <ConstructorClient
        key={`copy:${copyParam}`}
        config={sampleTextsFor(config, fromSample)}
        source={source}
        revision={null}
        hallId={null}
        draftId={`copy:${copyParam}`}
        existing={null}
        origin={texts.originCopy(original.config.name)}
      />
    );
  }

  if (hallParam === undefined) return <ConstructorChooser />;

  const hall = getHallResponse(hallParam);
  const record = findHall(hallParam);
  if (!hall || !record) notFound();
  const { config } = parseHallConfig(hall.config, { strict: true });
  return (
    <ConstructorClient
      key={hallParam}
      config={sampleTextsFor(config, record.sample === true)}
      source={hall.source}
      revision={hall.revision}
      hallId={hallParam}
      draftId={hallParam}
      existing={{
        name: record.name,
        sample: record.sample === true,
        sessions: listSessions(hallParam) ?? [],
      }}
      origin={null}
    />
  );
}

/** `?copy=<id>` of a hall whose copy would be larger than a stored hall may be. */
function CopyTooLarge({ hallId, name }: { hallId: string; name: string }) {
  const texts = t.constructorChooser;
  return (
    <main className="landing" data-testid="copy-too-large">
      <p>
        <Link href="/">{t.common.allHalls}</Link>
      </p>
      <h1>{texts.copyTooLargeTitle}</h1>
      <p className="lede" role="alert">
        {texts.copyTooLargeText(name)}
      </p>
      <p>
        <Link href={`/constructor?hall=${encodeURIComponent(hallId)}`}>
          {texts.copyTooLargeEdit(name)}
        </Link>
      </p>
    </main>
  );
}

/** `/constructor` without parameters: start a new hall, or pick a hall to edit. */
function ConstructorChooser() {
  const texts = t.constructorChooser;
  const halls = allHallCards();
  return (
    <main className="landing" data-testid="constructor-chooser">
      <p>
        <Link href="/">{t.common.allHalls}</Link>
      </p>
      <h1>{texts.title}</h1>
      <p className="lede">{texts.lede}</p>
      <section className="panel create-panel" aria-labelledby="new-title">
        <h2 id="new-title">{t.common.createNewHall}</h2>
        <NewHallChooser halls={halls.map((hall) => ({ id: hall.id, name: hall.name }))} />
      </section>
      <section className="panel create-panel" aria-labelledby="edit-title">
        <h2 id="edit-title">{texts.editTitle}</h2>
        <ul className="link-list">
          {halls.map((hall) => (
            <li key={hall.id}>
              <Link href={`/constructor?hall=${encodeURIComponent(hall.id)}`}>{hall.name}</Link>
              <span className="muted">
                {texts.hallFacts(hall.seats, hall.sessions.length, hall.sample === true)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
