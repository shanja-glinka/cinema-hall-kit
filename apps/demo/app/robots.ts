import type { MetadataRoute } from 'next';

/** Allow crawlers to index public demo pages and point them to the stable sitemap. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: 'https://cinema-hall-kit.freemyip.com/sitemap.xml',
  };
}
