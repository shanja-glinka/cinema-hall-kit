import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
// Order matters: the host's own styles first, then the package. The host's `@layer app` is
// declared after the package's `chk` layers, so its overrides win without !important.
import './globals.css';
import '@cinema-hall/react/styles.css';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://cinema-hall-kit.freemyip.com'),
  title: {
    default: 'Cinema Hall Kit | Cinema Hall Builder and Seat Picker',
    template: '%s | Cinema Hall Kit',
  },
  description:
    'Explore a React and TypeScript toolkit for cinema hall layouts, seat selection, and seat-view previews.',
  applicationName: 'Cinema Hall Kit',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Cinema Hall Kit',
    title: 'Cinema Hall Kit | Cinema Hall Builder and Seat Picker',
    description:
      'Explore a React and TypeScript toolkit for cinema hall layouts, seat selection, and seat-view previews.',
    url: '/',
    locale: 'en_US',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Cinema Hall Kit' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cinema Hall Kit | Cinema Hall Builder and Seat Picker',
    description:
      'Explore a React and TypeScript toolkit for cinema hall layouts, seat selection, and seat-view previews.',
    images: ['/opengraph-image'],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
