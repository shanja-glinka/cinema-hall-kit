'use client';

import {
  CinemaHallProvider,
  labels,
  themes,
  type ButtonSlotProps,
  type Slots,
} from '@cinema-hall/react';
import type { ReactNode } from 'react';

/**
 * The host's own Button, used by the picker wherever it renders a button (sheet, view header).
 * Declared at module level: a slot's identity must stay the same between renders.
 */
function DemoButton({
  variant,
  size = 'md',
  loading,
  disabled,
  type = 'button',
  onClick,
  className,
  children,
  ...aria
}: ButtonSlotProps) {
  const classes = ['demo-button', className].filter(Boolean).join(' ');
  return (
    <button
      type={type}
      className={classes}
      data-variant={variant}
      data-size={size}
      data-loading={loading ? '' : undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      onClick={onClick}
      {...aria}
    >
      {children}
    </button>
  );
}

const demoSlots: Partial<Slots> = { Button: DemoButton };

// English copy, with one line replaced to show that individual labels can be overridden.
const demoLabels = {
  ...labels.en,
  picker: {
    ...labels.en.picker,
    book: 'Book seats · {price}',
  },
};

/** Once for the whole app: locale, labels, theme and slots reach every picker below. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <CinemaHallProvider
      locale="en-US"
      labels={demoLabels}
      theme={themes.cinemaDark}
      slots={demoSlots}
    >
      {children}
    </CinemaHallProvider>
  );
}
