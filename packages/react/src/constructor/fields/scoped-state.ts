import { useCallback, useState } from 'react';

interface Scoped<T> {
  readonly generation: number;
  readonly value: T;
}

/**
 * Field state that belongs to one editor generation. After a reset, a template, an import, an undo
 * or a redo the generation changes, and the state reads as `initial` again. No effect is needed,
 * so no stale draft is ever shown, not even for a single render.
 * @param generation Editor generation the state belongs to.
 * @param initial Value used after the generation changes.
 * @returns The value and its setter.
 * @example const [draft, setDraft] = useScopedState(editor.generation, null);
 */
export function useScopedState<T>(generation: number, initial: T): [T, (value: T) => void] {
  const [scoped, setScoped] = useState<Scoped<T>>({ generation, value: initial });
  const set = useCallback((value: T) => setScoped({ generation, value }), [generation]);
  return [scoped.generation === generation ? scoped.value : initial, set];
}
