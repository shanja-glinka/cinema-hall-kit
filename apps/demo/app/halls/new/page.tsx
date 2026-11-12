import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { todayIso } from '@/lib/shared/generator';
import { pageMetadata } from '@/lib/seo';
import { NewHallClient } from './new-hall-client';

// `today` is the server's day: the date defaults must not be baked in at build time.
export const dynamic = 'force-dynamic';

export const metadata = pageMetadata({
  title: 'Upload a Hall Configuration',
  description:
    'Upload or paste a cinema hall YAML or JSON configuration, validate its layout, and preview generated demo showtimes.',
  path: '/halls/new',
});

/**
 * Server Component: reads the example hall and the server's date, the client does the rest. The
 * example loses its `id` (the server derives a free one) and gets a neutral name, so it can be
 * created again and again.
 */
export default function NewHallPage() {
  const source = readFileSync(join(process.cwd(), 'data', 'orbita-hall-2.yaml'), 'utf8');
  const example = source.replace(/^id:.*\n/m, '').replace(/^name:.*$/m, 'name: My Hall');
  return <NewHallClient exampleYaml={example} today={todayIso()} />;
}
