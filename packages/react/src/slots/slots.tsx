import type { ComponentType, ReactNode } from 'react';
import type { Price, Seat, SeatStatus } from '@cinema-hall/core';

/*
 * Slots are COMPONENTS (not render functions). Declare them outside render so their identity is
 * stable; the provider warns in development when a slot's identity changes between renders.
 * Slot props only grow in minor releases.
 */

/**
 * Props of the `Button` slot. `variant` picks the look. `loading` keeps the button in place, marks
 * it busy and disables it.
 */
export interface ButtonSlotProps {
  variant: 'primary' | 'inverse' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  loading?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  className?: string;
  'aria-label'?: string;
  children: ReactNode;
}

/** Props of the `Chip` slot, a small label. `tone` is `accent` or `neutral`. */
export interface ChipSlotProps {
  tone?: 'accent' | 'neutral';
  className?: string;
  children: ReactNode;
}

/** Props of the `Card` slot, a surface around its content. */
export interface CardSlotProps {
  className?: string;
  children: ReactNode;
}

/** A seat on the 2D map. Must render SVG elements; the map positions a `<g>` at the seat centre. */
export interface SeatSlotProps {
  seat: Seat;
  status: SeatStatus;
  selected: boolean;
  focused: boolean;
  /** 0 for the first seat type of the hall, 1 for the next, … */
  seatTypeIndex: number;
  price: Price | null;
  /** Seat cell size in SVG units. */
  width: number;
  height: number;
}

/**
 * Props of the `webglFallback` slot. It is shown in place of the 3D view when WebGL is unavailable
 * or the canvas cannot be created. `message` is the localised text to show.
 */
export interface WebglFallbackSlotProps {
  message: string;
}

/**
 * The replaceable components. `Button`, `Chip` and `Card` always have a value, because the defaults
 * fill in any that are not passed. The others are optional. Declare slot components outside render,
 * so that their identity stays stable.
 */
export interface Slots {
  Button: ComponentType<ButtonSlotProps>;
  Chip: ComponentType<ChipSlotProps>;
  Card: ComponentType<CardSlotProps>;
  /** Replaces the default seat glyph on the map. */
  seat?: ComponentType<SeatSlotProps>;
  /** Replaces the content of the built-in sheet; read state with `useSeatPicker()`. */
  sheetContent?: ComponentType;
  webglFallback?: ComponentType<WebglFallbackSlotProps>;
}

/** Name of a slot: a key of `Slots`. */
export type SlotName = keyof Slots;
/** Props type of the slot `N`, for example `SlotProps<'Button'>`. */
export type SlotProps<N extends SlotName> =
  NonNullable<Slots[N]> extends ComponentType<infer P> ? P : never;

/**
 * The default `Button` slot: a native `button` with `data-chk`, `data-variant` and `data-size`
 * attributes for styling. `loading` sets `aria-busy` and disables the button. Any other props, such
 * as `aria-label`, go to the element.
 */
export function DefaultButton({
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
  return (
    <button
      type={type}
      data-chk="button"
      data-variant={variant}
      data-size={size}
      data-loading={loading ? '' : undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      onClick={onClick}
      className={className}
      {...aria}
    >
      {children}
    </button>
  );
}

/** The default `Chip` slot: a `span` with `data-chk="chip"` and `data-tone`. */
export function DefaultChip({ tone = 'neutral', className, children }: ChipSlotProps) {
  return (
    <span data-chk="chip" data-tone={tone} className={className}>
      {children}
    </span>
  );
}

/** The default `Card` slot: a `div` with `data-chk="card"`. */
export function DefaultCard({ className, children }: CardSlotProps) {
  return (
    <div data-chk="card" className={className}>
      {children}
    </div>
  );
}

/** The built-in slot components. The provider uses them for every slot that is not overridden. */
export const defaultSlots: Slots = { Button: DefaultButton, Chip: DefaultChip, Card: DefaultCard };
