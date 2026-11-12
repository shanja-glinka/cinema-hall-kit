import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Pan, wheel zoom and two-pointer pinch for an isolated SVG plan.
 * @param svg Plan element ref.
 * @param bounds Untransformed SVG view box.
 * @returns Transform, reset and pointer controls.
 * @example const navigation = usePlanNavigation(svgRef, bounds);
 */
export function usePlanNavigation(svg: RefObject<SVGSVGElement | null>, bounds: Bounds) {
  const [transform, setTransform] = useState({ x: 0, y: 0, zoom: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const previous = useRef<{ x: number; y: number; distance: number } | null>(null);
  const dragged = useRef(false);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const scale = () => {
    const box = svg.current?.getBoundingClientRect();
    return box ? Math.min(box.width / bounds.width, box.height / bounds.height) || 1 : 1;
  };
  const point = (x: number, y: number) => {
    const rect = svg.current?.getBoundingClientRect();
    const ratio = scale();
    return {
      x:
        bounds.x +
        (x - (rect?.left ?? 0) - ((rect?.width ?? 0) - bounds.width * ratio) / 2) / ratio,
      y:
        bounds.y +
        (y - (rect?.top ?? 0) - ((rect?.height ?? 0) - bounds.height * ratio) / 2) / ratio,
    };
  };
  const zoomBy = (factor: number, anchor: { x: number; y: number }) =>
    setTransform((old) => {
      const zoom = Math.max(0.35, Math.min(6, old.zoom * factor));
      const ratio = zoom / old.zoom;
      return {
        zoom,
        x: anchor.x - (anchor.x - old.x) * ratio,
        y: anchor.y - (anchor.y - old.y) * ratio,
      };
    });
  const sample = () => {
    const values = [...pointers.current.values()];
    const first = values[0];
    if (!first) return null;
    const second = values[1];
    return second
      ? {
          x: (first.x + second.x) / 2,
          y: (first.y + second.y) / 2,
          distance: Math.hypot(first.x - second.x, first.y - second.y),
        }
      : { ...first, distance: 0 };
  };
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomBy(Math.exp(-event.deltaY * 0.002), point(event.clientX, event.clientY));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  });
  return {
    transform: `translate(${transform.x} ${transform.y}) scale(${transform.zoom})`,
    reset: () => setTransform({ x: 0, y: 0, zoom: 1 }),
    consumeClick: () => {
      const moved = dragged.current;
      dragged.current = false;
      return moved;
    },
    onPointerDown: (event: PointerEvent<SVGSVGElement>) => {
      if (event.button !== 0) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      previous.current = sample();
      origin.current = { x: event.clientX, y: event.clientY };
      dragged.current = false;
    },
    onPointerMove: (event: PointerEvent<SVGSVGElement>) => {
      if (!pointers.current.has(event.pointerId)) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const next = sample();
      const old = previous.current;
      if (!next || !old) return;
      if (
        !dragged.current &&
        origin.current &&
        Math.hypot(next.x - origin.current.x, next.y - origin.current.y) < 4 &&
        next.distance === 0
      )
        return;
      dragged.current = true;
      svg.current?.setPointerCapture?.(event.pointerId);
      if (next.distance > 0 && old.distance > 0)
        zoomBy(next.distance / old.distance, point(next.x, next.y));
      setTransform((value) => ({
        ...value,
        x: value.x + (next.x - old.x) / scale(),
        y: value.y + (next.y - old.y) / scale(),
      }));
      previous.current = next;
    },
    onPointerUp: (event: PointerEvent<SVGSVGElement>) => {
      pointers.current.delete(event.pointerId);
      previous.current = sample();
      if (svg.current?.hasPointerCapture?.(event.pointerId))
        svg.current.releasePointerCapture(event.pointerId);
    },
  };
}
