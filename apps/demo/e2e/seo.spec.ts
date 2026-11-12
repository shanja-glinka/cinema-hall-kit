import { expect, test } from '@playwright/test';

const SITE_URL = 'https://cinema-hall-kit.freemyip.com';

test('public demo pages expose English metadata and stable canonical URLs', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Cinema Hall Builder and Seat Picker Demo | Cinema Hall Kit');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', SITE_URL);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Try the Cinema Hall Kit demo: explore sample halls, configure a layout, and preview seat selection. Demo data is kept in server memory.',
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    'Cinema Hall Builder and Seat Picker Demo | Cinema Hall Kit',
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    `${SITE_URL}/opengraph-image`,
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  );

  await page.goto('/constructor?template=single');
  await expect(page).toHaveTitle('Interactive Hall Constructor | Cinema Hall Kit');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `${SITE_URL}/constructor`,
  );

  await page.goto('/halls/new');
  await expect(page).toHaveTitle('Upload a Hall Configuration | Cinema Hall Kit');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `${SITE_URL}/halls/new`,
  );

  await page.goto('/sessions/sat-1610');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `${SITE_URL}/sessions/sat-1610`,
  );

  const sitemapResponse = await request.get('/sitemap.xml');
  expect(sitemapResponse.ok()).toBe(true);
  const sitemap = await sitemapResponse.text();
  expect(sitemap).toContain(`<loc>${SITE_URL}</loc>`);
  expect(sitemap).toContain(`<loc>${SITE_URL}/constructor</loc>`);
  expect(sitemap).toContain(`<loc>${SITE_URL}/halls/new</loc>`);
  expect(sitemap).not.toContain('/sessions/');

  const robotsResponse = await request.get('/robots.txt');
  expect(robotsResponse.ok()).toBe(true);
  const robots = await robotsResponse.text();
  expect(robots).toContain('Allow: /');
  expect(robots).toContain('Disallow: /api/');
  expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
});
