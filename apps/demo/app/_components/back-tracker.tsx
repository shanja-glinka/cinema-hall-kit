'use client';

import { useEffect } from 'react';
import { rememberOrigin } from '@/lib/shared/back-link';

/**
 * Remembers the page a showtime was opened from, so the booking page can offer the way back to it.
 * Renders nothing.
 */
export function BackTracker() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest('a[href]');
      if (!link) return;
      rememberOrigin(
        link.getAttribute('href') ?? '',
        window.location.pathname + window.location.search,
        window.sessionStorage,
      );
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
  return null;
}
