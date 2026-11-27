import Link from 'next/link';
import { builtInTemplates } from '@cinema-hall/core';
import { templateChoices } from '@/lib/shared/templates';
import { t as texts } from '@/lib/shared/texts';

interface HallOption {
  id: string;
  name: string;
}

/**
 * "Create a new hall": a template to start from, or a copy of an existing hall. Works without
 * JavaScript: the copy picker is a plain GET form to `/constructor?copy=<id>`.
 * @param props The halls that can be copied.
 * @returns The chooser.
 */
export function NewHallChooser({ halls }: { halls: readonly HallOption[] }) {
  const choices = templateChoices(builtInTemplates);
  const t = texts.chooser;
  return (
    <div className="new-hall-chooser" data-testid="new-hall-chooser">
      <p className="chips-title">{t.fromTemplate}</p>
      <ul className="template-grid">
        {choices.map((choice) => (
          <li key={choice.id}>
            <Link
              href={`/constructor?template=${encodeURIComponent(choice.id)}`}
              className="template-card"
              data-template={choice.id}
            >
              <strong>{choice.title}</strong>
              {choice.description ? <span className="muted">{choice.description}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
      {halls.length > 0 ? (
        <form action="/constructor" method="get" className="copy-form">
          <label className="field">
            <span>{t.copyExisting}</span>
            <select name="copy" defaultValue={halls[0]?.id} aria-label={t.hallToCopy}>
              {halls.map((hall) => (
                <option key={hall.id} value={hall.id}>
                  {hall.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="button secondary">
            {t.copyThisHall}
          </button>
        </form>
      ) : null}
      <p className="muted import-link">
        {t.importQuestion} <Link href="/halls/new">{t.importLink}</Link>
      </p>
    </div>
  );
}
