import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import type { EasingDefinition } from 'motion/react';
import { Sheet } from 'react-modal-sheet';
import { clamp01 } from '../transitions/easing.js';
import { validateSnapOrder } from './snap.js';

/** The look of the sheet: glass, a plain surface, or nothing. */
export type SheetSkin = 'glass' | 'plain' | 'none';

/** Open animation of the sheet. */
export interface SheetTiming {
  /** Seconds. */
  duration: number;
  ease: EasingDefinition | ((t: number) => number);
}

/** Props of `GlassSheet`. */
export interface GlassSheetProps {
  open: boolean;
  /** Resolved snap points: fractions (0…1) or pixels, ascending, starting at 0 (closed). */
  snapPoints: number[];
  initialSnap: number;
  skin: SheetSkin;
  /** Element that receives `--chk-_dim` (0…1) as the sheet rises above `dimFromPx`. */
  dimTarget: HTMLElement | null;
  dimScene: boolean;
  /** Visible height (px) at which the dim starts: the peek snap. */
  dimFromPx: number;
  dismissible: boolean;
  /** The picker root: the sheet lives inside it (contained mode). */
  mountPoint: Element;
  label: string;
  dragLabel: string;
  onClose: () => void;
  onSnap?: (index: number) => void;
  /** No open animation: the first open in the view, or reduced motion. */
  instant?: boolean;
  /** Open animation timing from the transition. */
  tween?: SheetTiming;
  /** Added to the sheet's own classes. */
  className?: string;
  headerRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}

/**
 * Non-modal bottom sheet on react-modal-sheet. No backdrop, so the 3D scene stays draggable behind
 * it. The `unstyled` mode leaves the look to us: glass (`chk-glass`), a plain surface, or nothing.
 * Host scrolling is not locked, because the sheet does not block the page.
 * @param props - See `GlassSheetProps`.
 * @returns The sheet.
 * @example
 * ```tsx
 * <GlassSheet open snapPoints={[0, 200, 1]} initialSnap={1} skin="glass" mountPoint={root} ... >content</GlassSheet>
 * ```
 */
export function GlassSheet(props: GlassSheetProps) {
  const {
    open,
    snapPoints,
    initialSnap,
    skin,
    dimTarget,
    dimScene,
    dimFromPx,
    dismissible,
    mountPoint,
    label,
    dragLabel,
    onClose,
    onSnap,
    instant,
    tween,
    className,
    headerRef,
  } = props;
  const [activeSnap, setActiveSnap] = useState(initialSnap);
  const containerClass =
    [skin === 'glass' ? 'chk-glass' : '', className ?? ''].filter(Boolean).join(' ') || undefined;
  return (
    <Sheet
      isOpen={open}
      onClose={onClose}
      snapPoints={snapPoints}
      initialSnap={initialSnap}
      onSnap={(index) => {
        setActiveSnap(index);
        onSnap?.(index);
      }}
      mountPoint={mountPoint}
      unstyled
      disableDismiss={!dismissible}
      disableScrollLocking
      prefersReducedMotion={instant}
      // The dependency narrows its type to names/beziers; Motion's runtime also accepts functions.
      tweenConfig={tween ? { ...tween, ease: tween.ease as EasingDefinition } : undefined}
    >
      <SheetResizeBridge
        open={open}
        activeSnap={activeSnap}
        initialSnap={initialSnap}
        points={snapPoints}
      />
      <SheetDimBridge target={dimTarget} enabled={dimScene} fromPx={dimFromPx} />
      <Sheet.Container
        data-chk="sheet"
        data-skin={skin}
        aria-label={label}
        className={containerClass}
      >
        <Sheet.Header ref={headerRef} data-chk="sheet-header">
          <div data-chk="sheet-handle" role="presentation" aria-label={dragLabel} />
        </Sheet.Header>
        <Sheet.Content data-chk="sheet-content">{props.children}</Sheet.Content>
      </Sheet.Container>
    </Sheet>
  );
}

/**
 * Writes the dim (0…1) to a CSS variable on the scene element: 0 at and below the peek snap, 1 at
 * the full snap. Imperative on purpose: the sheet moves every frame and React must not re-render
 * for it. Off, or unmounted, the variable goes back to 0.
 */
function SheetDimBridge({
  target,
  enabled,
  fromPx,
}: {
  target: HTMLElement | null;
  enabled: boolean;
  fromPx: number;
}) {
  const { yInverted, height } = Sheet.useContext();
  useEffect(() => {
    if (!target) return undefined;
    if (!enabled) {
      target.style.setProperty('--chk-_dim', '0');
      return undefined;
    }
    const span = Math.max(1, height - fromPx);
    const apply = (px: number) =>
      target.style.setProperty('--chk-_dim', String(clamp01((px - fromPx) / span)));
    apply(yInverted.get());
    const off = yInverted.on('change', apply);
    return () => {
      off();
      target.style.setProperty('--chk-_dim', '0');
    };
  }, [yInverted, target, enabled, fromPx, height]);
  return null;
}

/** react-modal-sheet recomputes its stops after resize but leaves y at the old height. */
function SheetResizeBridge({
  open,
  activeSnap,
  initialSnap,
  points,
}: {
  open: boolean;
  activeSnap: number;
  initialSnap: number;
  points: number[];
}) {
  const { height, snapTo } = Sheet.useContext();
  const signature = points.join(',');
  const previous = useRef({ height, signature, open });
  useEffect(() => {
    validateSnapOrder(points, height);
    const changed = previous.current.height !== height || previous.current.signature !== signature;
    const index = previous.current.open ? activeSnap : initialSnap;
    previous.current = { height, signature, open };
    if (open && height > 0 && changed && index > 0 && index < points.length) snapTo(index);
  }, [height, signature, open, activeSnap, initialSnap, points, snapTo]);
  return null;
}
