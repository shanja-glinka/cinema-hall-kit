import type { Metadata } from 'next';

interface PageMetadataInput {
  title: string;
  description: string;
  path: string;
}

/** Builds consistent canonical and social metadata for a stable public demo page. */
export function pageMetadata({ title, description, path }: PageMetadataInput): Metadata {
  const brandedTitle = `${title} | Cinema Hall Kit`;
  return {
    title: { absolute: brandedTitle },
    description,
    alternates: { canonical: path },
    openGraph: {
      title: brandedTitle,
      description,
      url: path,
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Cinema Hall Kit' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: brandedTitle,
      description,
      images: ['/opengraph-image'],
    },
  };
}
