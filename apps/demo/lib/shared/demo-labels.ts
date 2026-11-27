/**
 * The texts the demo gives the library (picker and constructor). Shared by the app's provider and
 * the pages that turn a server answer into the same words the picker uses.
 */
import { labels, type Labels } from '@cinema-hall/react';
import { t } from './texts';

/**
 * The package's English texts, with one line replaced to show that individual labels can be
 * overridden: the picker's button only reserves the seats for 10 minutes (the purchase comes
 * after), so it says "Reserve seats", not "Book".
 */
export const demoLabels: Labels = {
  ...labels.en,
  picker: { ...labels.en.picker, book: t.booking.reserveButton },
};
