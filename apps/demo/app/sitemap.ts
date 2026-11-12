import type { MetadataRoute } from 'next';

const siteUrl = 'https://cinema-hall-kit.freemyip.com';

/** The public product demo pages that have stable, indexable URLs. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: 'weekly', priority: 1 },
    { url: `${siteUrl}/constructor`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${siteUrl}/halls/new`, changeFrequency: 'monthly', priority: 0.7 },
  ];
}
