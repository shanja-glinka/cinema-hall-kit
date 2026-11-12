import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/** A value that is either controlled by the host or kept by the picker. */
export interface Controllable<T> {
  /** The value to render: the host's `value` when controlled, otherwise the picker's own. */
  value: T;
  /** The latest value, for handlers that run after a render (kept current by a layout effect). */
  read(): T;
  /** Requests a new value. Stored when uncontrolled; always reported through `onChange`. */
  set(next: T): void;
}

/**
 * A value that is either controlled (`value` is defined: the host owns it, the picker only asks
 * for changes through `onChange`) or uncontrolled (the picker keeps it and still reports changes).
 * @param value - The host value, or `undefined` when uncontrolled.
 * @param defaultValue - Initial value when uncontrolled.
 * @param onChange - Called with every requested value.
 * @returns The value to render, a reader of the latest value and a requester.
 * @example
 * ```tsx
 * const selection = useControllable(props.value, [], props.onValueChange);
 * selection.set([...selection.read(), key]);
 * ```
 */
export function useControllable<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (next: T) => void,
): Controllable<T> {
  const [internal, setInternal] = useState<T>(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : internal;
  const latest = useRef(current);
  const controlledRef = useRef(controlled);
  const changeRef = useRef(onChange);
  useLayoutEffect(() => {
    latest.current = current;
    controlledRef.current = controlled;
    changeRef.current = onChange;
  });

  const set = useCallback((next: T) => {
    if (!controlledRef.current) {
      latest.current = next;
      setInternal(next);
    }
    changeRef.current?.(next);
  }, []);
  const read = useCallback(() => latest.current, []);
  return { value: current, read, set };
}
