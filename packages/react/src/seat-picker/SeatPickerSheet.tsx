import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatLabel } from '../labels/labels.js';
import { partClass } from '../provider/provider.js';
import { GlassSheet } from '../sheet/GlassSheet.js';
import { FALLBACK_PEEK_PX, fitPeek, initialSnapIndex, resolveSnapPoints } from '../sheet/snap.js';
import { SeatDetails } from './SeatDetails.js';
import { useRequiredModel } from './use-seat-picker.js';

/** Share of the root the compact top may take before the hero shrinks. */
const COMPACT_SHARE = 0.45;

/** The sheet container is `100% - safe-area-inset-top - 34px` tall in react-modal-sheet. */
const SHEET_TOP_GAP_PX = 34;

/**
 * The seat sheet: a glass bottom sheet with a compact top (zone, seat, price, Book) and details.
 * On a wide root it renders the static glass details panel instead.
 * @returns The sheet, the panel, or `null`.
 * @example
 * ```tsx
 * <SeatPickerSheet />
 * ```
 */
export function SeatPickerSheet() {
  const model = useRequiredModel('SeatPickerSheet');
  const { sheet, rootEl, options } = model;
  const [peekEl, setPeekEl] = useState<HTMLElement | null>(null);
  const [headerEl, setHeaderEl] = useState<HTMLElement | null>(null);
  const [peekPx, setPeekPx] = useState(0);
  // Full height of the sheet container (it is shorter than the root: safe area and a top gap).
  const [sheetHeightPx, setSheetHeightPx] = useState(0);
  // Peek height while the hero is at full size: the compact top must stay within ~45% of the root.
  const [fullPeekPx, setFullPeekPx] = useState(0);
  const rootHeight = model.rootHeight;
  const compact = rootHeight > 0 && fullPeekPx > rootHeight * COMPACT_SHARE;
  const compactRef = useRef(compact);
  useLayoutEffect(() => {
    compactRef.current = compact;
  });

  // The peek height is measured from the sheet's top to the bottom of the compact block plus the
  // body's bottom padding (the compact block carries the safe area), so the actions are never cut.
  useEffect(() => {
    if (!peekEl || !headerEl) return undefined;
    const update = () => {
      // The real offset of the compact block's bottom from the sheet's top (header, body padding
      // and all), plus the padding the body keeps below it; summed sizes only as a fallback.
      const container = peekEl.closest<HTMLElement>('[data-chk="sheet"]');
      const body = peekEl.closest<HTMLElement>('[data-chk="sheet-content"]');
      const below = body ? Number.parseFloat(getComputedStyle(body).paddingBottom) || 0 : 0;
      // A scrolled content scroller moves the block in the viewport; add the scroll back so the
      // peek does not depend on where the viewer has scrolled to.
      let scrolled = 0;
      for (
        let node = peekEl.parentElement;
        node && container && node !== container;
        node = node.parentElement
      )
        scrolled += node.scrollTop;
      const measured = container
        ? Math.ceil(
            peekEl.getBoundingClientRect().bottom -
              container.getBoundingClientRect().top +
              scrolled +
              below,
          )
        : 0;
      setSheetHeightPx(container ? Math.round(container.getBoundingClientRect().height) : 0);
      const px = measured > 0 ? measured : headerEl.offsetHeight + peekEl.offsetHeight;
      setPeekPx(px);
      if (!compactRef.current) setFullPeekPx(px);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(peekEl);
    observer.observe(headerEl);
    const container = peekEl.closest<HTMLElement>('[data-chk="sheet"]');
    if (container) observer.observe(container);
    return () => observer.disconnect();
  }, [peekEl, headerEl]);

  if (model.desktop) {
    const Content = options.slots.sheetContent;
    return (
      <section
        data-chk="details-panel"
        data-skin={sheet?.skin ?? 'glass'}
        className={partClass(
          options,
          'sheet',
          !sheet || sheet.skin === 'glass' ? 'chk-glass' : undefined,
        )}
        aria-label={formatLabel(options.labels.picker.chooseSeat)}
      >
        {Content ? <Content /> : <SeatDetails model={model} />}
      </section>
    );
  }
  if (!sheet || !rootEl) return null;
  const labels = options.labels.picker;
  // The peek stays strictly inside the sheet container, which is shorter than the root (the
  // library keeps a top gap and the top safe area free); the next snap bounds it from above.
  const containerPx =
    sheetHeightPx > 0 ? sheetHeightPx : Math.max(0, rootHeight - SHEET_TOP_GAP_PX);
  const peekIndex = sheet.snapPoints.indexOf('peek');
  const next = peekIndex >= 0 ? sheet.snapPoints[peekIndex + 1] : undefined;
  // An unmeasured peek (0) first takes the fallback, so fitting never invents a 2 px peek that
  // would sit below an earlier numeric snap point.
  const measuredPeekPx = Number.isFinite(peekPx) && peekPx > 1 ? peekPx : FALLBACK_PEEK_PX;
  // The peek must also sit above an earlier numeric snap point (e.g. [0, 100, 'peek', 1]).
  const prev = peekIndex > 0 ? sheet.snapPoints[peekIndex - 1] : undefined;
  const prevPx = typeof prev === 'number' ? (prev > 0 && prev <= 1 ? prev * containerPx : prev) : 0;
  const knownPeekPx = Math.max(measuredPeekPx, prevPx + 1);
  const fittedPeekPx = containerPx > 0 ? fitPeek(knownPeekPx, containerPx, next) : knownPeekPx;
  const snapPoints = resolveSnapPoints(sheet.snapPoints, fittedPeekPx);
  const initialSnap = initialSnapIndex(sheet.snapPoints, sheet.initialSnap);
  const restPx = peekIndex >= 0 ? (snapPoints[peekIndex] ?? 0) : 0;
  const Content = options.slots.sheetContent;

  return (
    <GlassSheet
      open={model.sheetOpen}
      snapPoints={snapPoints}
      initialSnap={initialSnap}
      skin={sheet.skin}
      dimTarget={model.viewEl}
      dimScene={sheet.dimScene}
      dimFromPx={restPx}
      dismissible={sheet.dismissible}
      mountPoint={rootEl}
      label={formatLabel(labels.chooseSeat)}
      dragLabel={formatLabel(labels.dragHandle)}
      onClose={model.actions.backToMap}
      instant={model.sheetInstant}
      tween={model.sheetTween}
      className={options.classNames.sheet}
      headerRef={setHeaderEl}
    >
      <div
        data-chk="sheet-body"
        data-chk-compact={compact ? '' : undefined}
        className={partClass(options, 'sheetContent')}
      >
        {Content ? <Content /> : <SeatDetails peekRef={setPeekEl} model={model} />}
      </div>
    </GlassSheet>
  );
}
