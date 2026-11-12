import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { formatPrice as formatPlainPrice, type Price } from '@cinema-hall/core';
import {
  deepMerge,
  labels as builtInLabels,
  type DeepPartial,
  type Labels,
} from '../labels/labels.js';
import { defaultSlots, type Slots } from '../slots/slots.js';
import { mergeThemes, themeToStyle, type Theme } from '../theme/tokens.js';

/**
 * Element names for `classNames`. Classes are appended to the library's own, never replace them.
 */
export type PartName =
  | 'root'
  | 'map'
  | 'mapScreen'
  | 'seat'
  | 'rowLabel'
  | 'legend'
  | 'footer'
  | 'view'
  | 'viewHeader'
  | 'sheet'
  | 'sheetContent'
  | 'metric'
  | 'minimap'
  | 'editor'
  | 'editorToolbar'
  | 'editorCanvas'
  | 'editorInspector'
  | 'editorIssues';

/**
 * Extra class names per part. They are added to the library's own classes and never replace them.
 */
export type ClassNames = Partial<Record<PartName, string>>;

/**
 * Settings for the components below a `CinemaHallProvider`, or given directly to a component, where
 * a component's own props win over the provider. `theme` and `labels` merge key by key. `slots` and
 * `classNames` replace only the keys that are passed.
 */
export interface CinemaHallOptions {
  /** Colours, radius and fonts. See `Theme`. */
  theme?: Theme;
  /** Text overrides. They merge over the built-in texts of the chosen `locale`. */
  labels?: DeepPartial<Labels>;
  /** BCP 47 locale for numbers and prices. */
  locale?: string;
  /** Replacement components, by slot name. */
  slots?: Partial<Slots>;
  /** Extra classes per part of the library. */
  classNames?: ClassNames;
  /**
   * Custom price text, e.g. `(p) => `${p} ₽``. Default: two decimals + `labels.picker.priceSign`.
   */
  formatPrice?: (price: Price, locale: string | undefined) => string;
}

/**
 * The options after the provider and the component's own overrides are merged. Components read
 * these. `formatPrice` is the one place where a price becomes text.
 */
export interface ResolvedOptions {
  theme: Theme;
  labels: Labels;
  locale: string | undefined;
  slots: Slots;
  classNames: ClassNames;
  formatPrice: (price: Price) => string;
}

const CinemaHallContext = createContext<CinemaHallOptions | null>(null);

function useSlotIdentityWarning(slots: Partial<Slots> | undefined, owner: string) {
  const previous = useRef(slots);
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const before = previous.current;
    if (before && slots) {
      for (const name of Object.keys(slots) as (keyof Slots)[]) {
        if (before[name] && slots[name] && before[name] !== slots[name]) {
          console.warn(
            `[cinema-hall] ${owner}: slot "${name}" changed identity between renders. Declare slot components outside render, otherwise they remount every time.`,
          );
        }
      }
    }
    previous.current = slots;
  }, [slots, owner]);
}

/**
 * Shared settings for every Cinema Hall component below it. Component props override the provider:
 * `theme` and `labels` merge key by key, `slots` and `classNames` replace only the keys you pass.
 *
 * @example
 * ```tsx
 * <CinemaHallProvider theme={themes.light} locale="en-US">
 *   <SeatView layout={layout} seatKey={null} />
 * </CinemaHallProvider>
 * ```
 */
export function CinemaHallProvider({
  children,
  ...options
}: CinemaHallOptions & { children: ReactNode }) {
  const parent = useContext(CinemaHallContext);
  useSlotIdentityWarning(options.slots, 'CinemaHallProvider');
  const { theme, labels, locale, slots, classNames, formatPrice } = options;
  const value = useMemo(
    () => mergeOptions(parent ?? {}, { theme, labels, locale, slots, classNames, formatPrice }),
    [parent, theme, labels, locale, slots, classNames, formatPrice],
  );
  return <CinemaHallContext.Provider value={value}>{children}</CinemaHallContext.Provider>;
}

function mergeOptions(base: CinemaHallOptions, over: CinemaHallOptions): CinemaHallOptions {
  return {
    theme: mergeThemes(base.theme, over.theme),
    labels: deepMerge<DeepPartial<Labels>>(base.labels ?? {}, over.labels),
    locale: over.locale ?? base.locale,
    slots: { ...base.slots, ...over.slots },
    classNames: { ...base.classNames, ...over.classNames },
    formatPrice: over.formatPrice ?? base.formatPrice,
  };
}

/**
 * Resolves provider + component-level overrides. Every top-level component calls this once and
 * passes the result down (or re-provides it through `ChkScope`).
 */
export function useCinemaHall(overrides: CinemaHallOptions = {}): ResolvedOptions {
  const fromProvider = useContext(CinemaHallContext);
  useSlotIdentityWarning(overrides.slots, 'component');
  const {
    theme,
    labels: labelOverrides,
    locale: localeOverride,
    slots,
    classNames,
    formatPrice,
  } = overrides;
  return useMemo(() => {
    const merged = mergeOptions(fromProvider ?? {}, {
      theme,
      labels: labelOverrides,
      locale: localeOverride,
      slots,
      classNames,
      formatPrice,
    });
    const locale = merged.locale ?? 'en-US';
    const userFormat = merged.formatPrice;
    const labels = deepMerge<Labels>(builtInLabels.en, merged.labels);
    const sign = typeof labels.picker.priceSign === 'string' ? labels.picker.priceSign : '¤';
    return {
      theme: merged.theme ?? {},
      labels,
      locale,
      slots: { ...defaultSlots, ...merged.slots },
      classNames: merged.classNames ?? {},
      formatPrice: (price: Price) =>
        userFormat ? userFormat(price, locale) : formatPlainPrice(price, locale, sign),
    };
  }, [fromProvider, theme, labelOverrides, localeOverride, slots, classNames, formatPrice]);
}

const ResolvedContext = createContext<ResolvedOptions | null>(null);

/** Makes resolved options available to deep children (`useResolvedOptions`). */
export function ChkScope({ value, children }: { value: ResolvedOptions; children: ReactNode }) {
  return <ResolvedContext.Provider value={value}>{children}</ResolvedContext.Provider>;
}

/** Resolved options inside a component tree; falls back to provider-only resolution. */
export function useResolvedOptions(): ResolvedOptions {
  const scoped = useContext(ResolvedContext);
  const fallback = useCinemaHall();
  return scoped ?? fallback;
}

/** Props for a component's root element: class, scheme attribute and theme variables. */
export interface RootElementProps {
  className: string;
  'data-chk-scheme': 'dark' | 'light' | 'auto';
  'data-chk-layout'?: 'contained' | 'fullscreen';
  style: CSSProperties;
}

/**
 * Props for a component's root element: the class list (the library's `chk-root`, the host's root
 * class and the component's own class), the `data-chk-scheme` attribute, an optional
 * `data-chk-layout` attribute and the theme's CSS variables as inline style. `extra` adds the
 * component's own class, style and layout.
 */
export function rootProps(
  options: ResolvedOptions,
  extra: { className?: string; style?: CSSProperties; layout?: 'contained' | 'fullscreen' } = {},
): RootElementProps {
  return {
    className: ['chk-root', options.classNames.root, extra.className].filter(Boolean).join(' '),
    'data-chk-scheme': options.theme.scheme ?? 'dark',
    ...(extra.layout ? { 'data-chk-layout': extra.layout } : {}),
    style: { ...themeToStyle(options.theme), ...extra.style },
  };
}

/** Joins the library class for a part with the host's class for it. */
export function partClass(
  options: ResolvedOptions,
  part: PartName,
  base?: string,
): string | undefined {
  return [base, options.classNames[part]].filter(Boolean).join(' ') || undefined;
}
